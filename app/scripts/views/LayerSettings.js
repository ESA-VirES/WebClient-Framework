/*global _ $ * d3 showMessage getISODateTimeString */
/*global get has */

(function () {
  'use strict';

  var root = this;

  root.define([
    'backbone',
    'communicator',
    'globals',
    'choices',
    'colormap',
    'hbs!tmpl/LayerSettings',
    'hbs!tmpl/wps_eval_composed_model',
    'underscore'
  ],

  function (Backbone, Communicator, globals, Choices, colormap, LayerSettingsTmpl, evalModelTmplComposed_POST) {

    var ModelComponentParameters = function (model, source) {
      var sources = [];
      if (typeof model.get("filename") !== 'undefined') {
        sources = [model.get("filename")];
      } else if (typeof model.get("sources") !== 'undefined') {
        sources = model.get("sources");
      }
      var config = globals.models.config[model.id] || {};
      var isSelected = Boolean(source);
      var defaults = null, parameters = null;
      source = source || {};
      if (!config.blockDegreeSelection) {
        defaults = model.get("parameters") || {};
        parameters = _.clone(source.parameters || {});
      }
      var excludes = {};
      _.each(config.excludes || [], function (id) {excludes[id] = true;});
      _.extend(this, {
        id: model.id,
        allowDegreeSelection: !config.blockDegreeSelection,
        name: config.name || model.id,
        selected: isSelected,
        sign: source.sign || "+",
        parameters: parameters,
        defaults: defaults,
        sources: sources,
        excludes: excludes,
      });
      this.sanitizeParameters();
    };

    _.extend(ModelComponentParameters.prototype, {

      signToHtml: {'+': '+', '-': '&minus;'},

      sanitizeParameters: function () {
        if (!this.allowDegreeSelection) return;
        if (this.isDefault(this.parameters.min_degree)) {
          delete this.parameters.min_degree;
        }

        if (this.isDefault(this.parameters.max_degree)) {
          delete this.parameters.max_degree;
        }
      },

      getMinDegree: function () {
        return this.parameters.min_degree;
      },

      getMaxDegree: function () {
        return this.parameters.max_degree;
      },

      setMinDegree: function (source) {
        var value = Number(source);
        if (source === '' || isNaN(value)) {
          delete this.parameters.min_degree;
        } else {
          this.parameters.min_degree = Math.max(
            this.defaults.min_degree,
            Math.min(value, (
              has(this.parameters, 'max_degree') ?
                this.parameters.max_degree :
                this.defaults.max_degree
            ))
          );
        }
        return this.parameters.min_degree;
      },

      setMaxDegree: function (source) {
        var value = Number(source);
        if (source === '' || isNaN(value)) {
          delete this.parameters.max_degree;
        } else {
          this.parameters.max_degree = Math.min(
            this.defaults.max_degree,
            Math.max(value, (
              has(this.parameters, 'min_degree') ?
                this.parameters.min_degree :
                this.defaults.min_degree
            ))
          );
        }
        return this.parameters.max_degree;
      },

      toggleSign: function () {
        this.sign = (this.sign === '+' ? '-' : '+');
        return this.sign;
      },

      isDefault: function (value) {
        return (value === undefined || value === -1 || isNaN(value));
      }
    });

    // ------------------------------------------------------------------------
    // parameter list helper class

    function ParameterList() {
      this.parameters = {};
      this.selected = null;
    }

    _.extend(ParameterList.prototype, {

      getSelectedParameter: function () {
        if (this.selected === null || !has(this.parameters, this.selected)) {
          return null;
        }
        return this.parameters[this.selected];
      },

      set: function (parameters) {
        this.parameters = this._filterOutHiddenParameters(parameters);
        this.selected = this._findSelected(this.parameters);
        return this;
      },

      setSelected: function (key) {
        this._unsetSelected(this.parameters, this.selected);
        this._setSelected(this.parameters, key);
        this.selected = key;
        return this;
      },

      _unsetSelected: function (parameters, key) {
        if (has(parameters, key)) {
          delete parameters[key].selected;
        }
      },

      _setSelected: function (parameters, key) {
        if (has(parameters, key)) {
          parameters[key].selected = true;
        }
      },

      _findSelected: function (parameters) {
        var selected = null;
        _.find(parameters, function (value, key) {
          if (value.selected) {
            selected = key;
            return false;
          }
          return false;
        });
        return selected;
      },

      _filterOutHiddenParameters: function (parameters) {
        var parameters = _.clone(parameters);
        _.each(parameters, function (value, key) {
          if (get(value, 'hidden', false)) {
            delete parameters[key];
          }
        });
        return parameters;
      },

    });

    // ------------------------------------------------------------------------

    var LayerSettings = Backbone.Marionette.Layout.extend({

      template: {type: 'handlebars', template: LayerSettingsTmpl},
      className: "panel panel-default optionscontrol not-selectable",

      initialize: function (options) {
        this.colorscales = _.sortBy(_.keys(colormap.colorscaleDefinitions));
        this.parameters = new ParameterList();
        this.selected_satellite = "Alpha";
      },

      setModel: function (model) {
        this.model = model;
      },

      sameModel: function (model) {
        return this.model.get("name") == model.get("name");
      },

      onShow: function () {

        var selectSatellite = _.bind(function (satellite) {
          var _getCurrentModel = function (id) {
            return globals.products.find(function (product) {return product.get("download").id == id;});
          };
          this.selected_satellite = satellite;
          this.current_model = _getCurrentModel(globals.swarm.products[this.model.get("id")][satellite]);
        }, this);

        if (this.model.get("containerproduct")) {
          this._renderSatelliteSelection(
            this.selected_satellite,
            _.bind(function (selectedSatellite) {
              selectSatellite(selectedSatellite);
              this.renderView();
            }, this)
          );
          selectSatellite(this.selected_satellite);
        } else {
          this.current_model = this.model;
        }
        this.renderView();
      },

      renderView: function () {

        // do nothing if the current model is not set
        if (!this.current_model) {
          console.error("No model is set! Layer settings cannot be rendered properly");
          return;
        }

        this._updateEventHandler(Communicator.mediator, "layer:settings:changed", this.onParameterChange);
        this._updateEventHandler(Communicator.mediator, "models:update", this.onParameterChange);
        this._updateEventHandler(Communicator.mediator, 'time:change');

        this._renderPanelHeader(this.current_model.get("name"));

        this.parameters.set(this.current_model.get("parameters"));

        this._renderParameterSelection();

        this._clearLayerSettings();

        var selectedParameter = this.parameters.getSelectedParameter() || {};
        if (selectedParameter.name) {

          this._renderLayerSettings(selectedParameter);

          if (this.current_model.get("model") && this.current_model.get("editable")) {
            this._renderCustomModelUpload();
            this._renderApplyButton();
            this._renderComposedModelSelection();
          } else {
            this._clearComposedModelSelection();
          }
        }

      },

      onParameterSelected: function () {

        var selectedParameter = this.parameters.getSelectedParameter() || {};

        this._clearLayerSettings();
        this._renderLayerSettings(selectedParameter);

        // request range for selected parameter if layer is of type model
        if (this.current_model.get("model") && selectedParameter.name !== "Fieldlines") {
          this._fetchComposedModelValuesRange();
        } else {
          Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
        }

      },

      onClose: function () {
        this._deleteSavedModelComponents();
        this.close();
      },

      onParameterChange: function () {
        this._saveModelComponents();
        this.onShow();
      },

      onTimeChange: function () {
        $('.model-sources-label').addClass('hidden');
      },

      onCustomModelUpload: function (evt) {
        var reader = new FileReader();
        var filename = evt.target.files[0].name;
        reader.onloadend = _.bind(function (evt) {
          this._activateApplyButton();

          // save SHC file to localstorage
          localStorage.setItem('shcFile', JSON.stringify({
            filename: filename,
            data: evt.target.result
          }));

          // update the source custom model
          globals.models.setCustomModel(evt.target.result, filename);

          if (this.current_model.getCustomModelIfSelected()) {
            this._fetchComposedModelValuesRange();
            Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
            if (this.current_model.get("visible")) {
              Communicator.mediator.trigger("model:change", this.current_model.get("download").id);
            }
          }
          this._saveModelComponents();
          this.onShow();
        }, this);

        reader.readAsText(evt.target.files[0]);
      },

      _updateEventHandler: function (mediator, eventName, handler) {
        // Unbind first to make sure we are not binding to many times
        this.stopListening(mediator, eventName, handler);
        this.listenTo(mediator, eventName, handler);
      },

      _registerKeyEventHandlers: function (element) { // FIXME: deprecated jQuery API
        element.unbind();
        element.keypress(_.bind(function (evt) {
          if (evt.keyCode == 13) { //Enter pressed
            evt.preventDefault();
            this._applyChanges();
          } else {
            this._renderApplyButton();
          }
        }, this));

        element.keyup(_.bind(function (evt) {
          if (evt.keyCode == 8) { //Backspace clicked
            this._renderApplyButton();
          }
        }, this));

        // Add click event to select text when clicking or tabbing into textfield
        element.click(function () {$(this).select();});
      },

      _applyChanges: function () {
        var selectedParameter = this.parameters.getSelectedParameter() || {};

        var isEditableModel = (
          this.current_model.get("model") && this.current_model.get("editable")
        );

        var error = false;
        var modelChanged = false;
        var heightChanged = false;
        var rangeChanged = false;

        // Check color ranges
        var range_min = parseFloat($("#range_min").val());
        error = error || this._checkNumberValue(range_min, this.$("#range_min"));

        var range_max = parseFloat($("#range_max").val());
        error = error || this._checkNumberValue(range_max, this.$("#range_max"));

        // Set range parameters and redraw color scale
        if (!error) {
          var old_range = selectedParameter.range;
          if (typeof old_range !== 'undefined' && (old_range[0] !== range_min || old_range[1] !== range_max)) {
            rangeChanged = true;
          }
          selectedParameter.range = [range_min, range_max];

          this._renderColorscale(selectedParameter);
        }

        // Check for height attribute
        if ($("#heightvalue").length) {
          var height = parseFloat($("#heightvalue").val());
          error = error || this._checkNumberValue(height, $("#heightvalue"));

          if (!error) {
            if (this.current_model.get("height") != height) {
              heightChanged = true;
            }
            this.current_model.set("height", height);
          }
        }

        if (isEditableModel) {
          error = error || this._checkComposedModelChanges();
        }

        if (error) {return;}

        if (isEditableModel) {
          modelChanged = this._applyComposedModelChanges();
          this._deactivateApplyButton();
        } else {
          // remove button for non-composed models
          this._removeApplyButton();
        }

        //Apply changes

        if ((modelChanged || heightChanged) && selectedParameter.name !== 'Fieldlines') {
          this._fetchComposedModelValuesRange();
        } else if (rangeChanged && selectedParameter.name === 'Fieldlines')
        {
          Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"), true);
        } else {
          Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
        }
        if (modelChanged && this.current_model.get("visible")) {
          Communicator.mediator.trigger("model:change", this.current_model.get("download").id);
        }
      },

      _checkNumberValue: function (value, textfield) {
        if (isNaN(value)) {
          textfield.addClass("text_error");
          return true;
        } else {
          textfield.removeClass("text_error");
          return false;
        }
      },

      _clearLayerSettings: function () {
        this.$("#description").empty();
        this.$("#style").empty();
        this.$("#range_min").hide();
        this.$("#range_max").hide();
        this.$("#colorscale").hide();
        this.$("#opacitysilder").parent().hide();
        this.$("#setting_colorscale").empty();
        this.$("#logarithmic").empty();
        this.$("#outlines").empty();
        this.$("#showColorscale").empty();
        this.$("#height").empty();
        this.$("#coefficients_range").hide();
      },

      _renderLayerSettings: function (parameter) {
        if (!get(parameter, 'allowLayerSettings', true)) {return;}

        this._renderDescription(parameter);
        this._renderRangeBoundInputs(parameter);
        this._renderColormapSelection(parameter);
        this._renderColorscale(parameter);
        this._renderLogScaleCheckbox(parameter);
        this._renderOutlinesCheckbox();
        this._renderLegendCheckbox();

        if (parameter.name !== "Fieldlines") {
          this._renderOpacitySlider();
          this._renderHeightTextbox();
        } else {
          // Check for possible already available selection
          if (this.current_model.id.indexOf('PPI') === -1) {
            this._warnIfNoAreaSelected();
          }
        }
      },

      _warnIfNoAreaSelected: function () {
        var areaSelection = localStorage.getItem('areaSelection');
        if (areaSelection === null || !JSON.parse(areaSelection)) {
          showMessage('warning', (
            'In order to visualize fieldlines please select an area using '
            + 'the "Select Area" button in the globe view. Click on a '
            + 'fieldline to display additional information.'
          ), 35);
        }
      },

      _renderPanelHeader: function (title) {
        this.$(".panel-title").html(`<h3 class="panel-title"><i class="fa fa-fw fa-sliders"></i> ${title} Settings</h3>`);
        this.$('.close').on("click", _.bind(this.onClose, this));
        this.$el.draggable({
          containment: "#main",
          scroll: false,
          handle: '.panel-heading'
        });
      },

      _renderSatelliteSelection: function (selectedSatellite, onSatelliteChange) {

        this.$("#satellite_selection")
          .off()
          .empty()
          .append('<label for="satellite_selec" style="width:120px;">Satellite </label>')
          .append('<select style="margin-left:4px;" name="satellite_selec" id="satellite_selec"></select>');

        _.each(
          _.keys(get(globals.swarm.products, this.model.get('id'), {})),
          function (key) {
            var selected = (key === selectedSatellite ? ' selected' : '');
            $('#satellite_selec').append(`<option value="${key}"${selected}>${key}</option>`);
          }
        );

        this.$("#satellite_selection").on('change', function () {
          onSatelliteChange($("#satellite_selection").find("option:selected").val());
        });
      },

      _renderParameterSelection: function () {
        this.$("#options").empty();
        this.$("#options").append(
          _.map(
            this.parameters.parameters,
            function (value, key) {
              var selected = value.selected ? " selected" : "";
              return `<option value="${key}"${selected}>${value.name}</option>`;
            },
            this).join("")
        );
        this.$("#options").unbind();
        this.$("#options").change(_.bind(function () {
          this.parameters.setSelected(
            this.$("#options").find("option:selected").val()
          );
          this.onParameterSelected();
        }, this));
      },

      _renderDescription: function (parameter) {
        this.$("#description").empty();
        if (parameter.description) {
          this.$("#description").text(parameter.description);
        }
      },

      _renderRangeBoundInputs: function (parameter) {
        this.$("#range_min").val(parameter.range[0]).show();
        this.$("#range_max").val(parameter.range[1]).show();
        this._registerKeyEventHandlers(this.$("#range_min"));
        this._registerKeyEventHandlers(this.$("#range_max"));
      },

      _renderOpacitySlider: function () {
        // FIXME: too many events triggered
        this.$("#opacitysilder")
          .val(this.current_model.get("opacity") * 100).parent()
          .show()
          .unbind()
          .on("input change", _.bind(function (evt) {
            var opacity = Number(evt.target.value) / 100;
            this.current_model.set("opacity", opacity);
            Communicator.mediator.trigger('productCollection:updateOpacity', {model: this.current_model, value: opacity});
          }, this));
      },

      _renderColormapSelection: function (parameter) {
        this.$("#style").append(
          _.map(this.colorscales, function (name) {
            var selected = parameter.colorscale == name ? " selected" : "";
            return `<option value="${name}"${selected}>${name}</option>`;
          }).join('')
        );
        this.$("#style").unbind();
        this.$("#style").change(_.bind(function (evt) {
          var parameter = this.parameters.getSelectedParameter();
          parameter.colorscale = $(evt.target).find("option:selected").text();
          this._renderColorscale(parameter);
          Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"), true);
        }, this));
      },

      _renderLegendCheckbox: function () {

        var showColorscale = this.current_model.get("showColorscale");

        if (typeof showColorscale === 'undefined') {return;}

        var checked = showColorscale ? " checked" : "";

        this.$("#showColorscale").empty().append(
          '<form style="vertical-align: middle;">'
          + '<label class="valign" for="outlines" style="width: 120px; margin">Legend </label>'
          + `<input class="valign" style="margin-top: -5px;" type="checkbox" name="outlines" value="outlines"${checked}></input>`
          + '</form>'
        );

        this.$("#showColorscale input").change(_.bind(function (evt) {
          var showColorscale = !this.current_model.get("showColorscale");
          this.current_model.set("showColorscale", showColorscale);
          Communicator.mediator.trigger("layer:colorscale:show", this.current_model.get("download").id);
        }, this));
      },

      _renderOutlinesCheckbox: function () {

        var outlines = this.current_model.get("outlines");

        if (typeof outlines === 'undefined') {return;}

        var checked = outlines ? " checked" : "";

        this.$("#outlines").empty().append(
          '<form style="vertical-align: middle;">'
          + '<label class="valign" for="outlines" style="width: 120px;">Outlines </label>'
          + `<input class="valign" style="margin-top: -5px;" type="checkbox" name="outlines" value="outlines"${checked}></input>`
          + '</form>'
        );

        this.$("#outlines input").change(_.bind(function (evt) {
          var outlines = !this.current_model.get("outlines");
          this.current_model.set("outlines", outlines);
          Communicator.mediator.trigger("layer:outlines:changed", this.current_model.get("views")[0].id, outlines);
        }, this));
      },

      _renderLogScaleCheckbox: function (parameter) {

        if (!has(parameter, "logarithmic")) {return;}

        var checked = parameter.logarithmic ? " checked" : "";

        this.$("#logarithmic").empty().append(
          '<form style="vertical-align: middle;">'
          + '<label class="valign" for="outlines" style="width: 100px;">Log. Scale</label>'
          + `<input class="valign" style="margin-top: -5px;" type="checkbox" name="logarithmic" value="logarithmic"${checked}></input>`
          + '</form>'
        );

        this.$("#logarithmic input").change(_.bind(function (evt) {
          var parameter = this.parameters.getSelectedParameter();
          parameter.logarithmic = !parameter.logarithmic;
          Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"), true);
          this._renderColorscale(parameter);
        }, this));
      },

      _renderColorscale: function (parameter) {

        this.$("#colorscale").show();

        var uom = parameter.uom;
        var range_max = parameter.range[0];
        var range_min = parameter.range[1];
        var isLogScale = get(parameter, "logarithmic", false);

        var margin = 20;
        var height = 40;
        var width = this.$("#setting_colorscale").width();
        var scalewidth = width - margin * 2;


        this.$("#setting_colorscale").empty().append(
          `<div id="gradient" style="width:${scalewidth}px;margin-left:${margin}px"></div>`
        );

        var style = parameter.colorscale;

        var data_url = (new colormap.ColorMap(style)).getCanvas().toDataURL('image/png');
        $('#gradient').css('background-image', `url(${data_url})`);

        var svgContainer = d3.select("#setting_colorscale").append("svg")
          .attr("width", width)
          .attr("height", height);

        var axisScale = isLogScale ? d3.scale.log() : d3.scale.linear();
        axisScale.domain([range_max, range_min]);
        axisScale.range([0, scalewidth]);

        var xAxis = d3.svg.axis()
          .scale(axisScale);

        if (isLogScale) {
          var numberFormat = d3.format(",f");
          xAxis.tickFormat(function logFormat(d) {
            var x = Math.log(d) / Math.log(10) + 1e-6;
            return Math.abs(x - Math.floor(x)) < .3 ? numberFormat(d) : "";
          });
        } else {
          var step = Number(((range_max - range_min) / 5).toPrecision(3));
          var ticks = d3.range(range_min, range_max + step, step);
          xAxis.tickValues(ticks);
          xAxis.tickFormat(d3.format("g"));
        }

        var g = svgContainer.append("g")
          .attr("class", "x axis")
          .attr("transform", "translate(" + [margin, 3] + ")")
          .call(xAxis);

        if (uom) {
          g.append("text")
            .style("text-anchor", "middle")
            .style("font-size", "1.1em")
            .attr("transform", "translate(" + [scalewidth / 2, 35] + ")")
            .text(uom);
        }

        svgContainer.selectAll(".tick").select("line")
          .attr("stroke", "black");
      },

      _renderHeightTextbox: function () {

        var height = this.current_model.get("height");

        if (!height && height !== 0) {return;}

        this.$("#height").empty().append(
          '<form style="vertical-align: middle;">'
          + '<label for="heightvalue" style="width: 120px;">Height</label>'
          + '<input id="heightvalue" type="text" style="width:35px; margin-left:8px"/>'
          + '</form>'
          + '<p style="font-size:0.85em; margin-left: 120px;">Above ellipsoid (Km)</p>'
        );
        this.$("#heightvalue").val(height);

        this._registerKeyEventHandlers(this.$("#heightvalue"));
      },

      _renderApplyButton: function () {
        if ($("#changesbutton").length == 0) {
          $("#applychanges").append('<button type="button" class="btn btn-default" id="changesbutton" style="width: 100%;"> Apply changes </button>');
          $("#changesbutton").click(_.bind(function (evt) {
            this._applyChanges();
          }, this));
        }
      },

      _activateApplyButton: function () {
        $("#changesbutton").addClass("unAppliedChanges");
      },

      _deactivateApplyButton: function () {
        $("#changesbutton").removeClass("unAppliedChanges");
      },

      _removeApplyButton: function () {
        $("#applychanges").empty();
      },

      _renderCustomModelUpload: function () {
        this.$("#shc")
          .empty()
          .append(
            '<p>Spherical Harmonics Coefficients</p>'
            + '<div class="myfileupload-buttonbar ">'
            + '<label class="btn btn-default shcbutton">'
            + '<span><i class="fa fa-fw fa-upload"></i> Upload SHC File</span>'
            + '<input id="upload-selection" type="file" accept=".shc" name="files[]" />'
            + '</label>'
            + '</div>'
          );

        this.$("#upload-selection")
          .unbind()
          .change(_.bind(this.onCustomModelUpload, this));

        /* Displayed by the model info.
        var customModel = this.current_model.getCustomModel();
        if (customModel) {
          this.$("#shc").append(`<p id="filename" style="font-size:.9em;">Selected File: ${customModel.get('filename')}</p>`);
        }
        */
      },

      _fetchComposedModelValuesRange: function () {
        var selectedTimeRange = Communicator.reqres.request('get:time');

        var options = {
          model_expression: this.current_model.getModelExpression(),
          shc: this.current_model.getCustomShcIfSelected(),
          variable: this.parameters.selected,
          begin_time: getISODateTimeString(selectedTimeRange.start),
          end_time: getISODateTimeString(selectedTimeRange.end),
          elevation: this.current_model.get("height"),
          height: 24,
          width: 24,
          getonlyrange: true
        };

        var payload = evalModelTmplComposed_POST(options);

        $.post({
          url: this.current_model.get("download").url,
          data: payload,
          contentType: 'application/xml; charset=utf-8',
        }).success(_.bind(this._handleRangeResponse, this))
          .fail(_.bind(this._handleRangeResponseError, this));
      },

      _handleRangeResponse: function (response) {
        var selectedParameter = this.parameters.getSelectedParameter() || {};
        var resp = response.split(',');
        var range = [Number(resp[1]), Number(resp[2])];
        if (!isNaN(range[0]) && !isNaN(range[1])) {
          // Make range "nicer", rounding depending on extent
          range = d3.scale.linear().domain(range).nice().domain();
          $("#range_min").val(range[0]);
          $("#range_max").val(range[1]);
          selectedParameter.range = range;
          this. _renderColorscale(selectedParameter);
        }
        Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
      },

      _handleRangeResponseError: function (response) {
        showMessage('warning', (
          'There is a problem requesting the range values for the color scale,'
          + ' please revise and set them to adequate values if necessary.'
        ), 15);
      },

      _handleRangeResponseSHC: function (evt, response) {
        this.handleRangeResponse(response);
        var params = {name: this.current_model.get("download").id, isBaseLayer: false, visible: false};
        Communicator.mediator.trigger('map:layer:change', params);
        Communicator.mediator.trigger("file:shc:loaded", evt.target.result);
        Communicator.mediator.trigger("layer:activate", this.current_model.get("views")[0].id);
      },

      _clearComposedModelSelection: function () {
        this.$("#composed_model_compute").empty();
      },

      _renderComposedModelSelection: function () {

        //composed model additional fields
        this.$("#composed_model_compute").empty();
        this.$("#composed_model_compute").append(
          '<select class="form-control" id="choices-multiple-remove-button" ' +
                  'placeholder="Choose model or type its name." multiple></select>'
        );

        // create hash of the previous components
        var previousSelection = {};
        _.each(
          this._loadSavedModelComponents() || this.current_model.get('components'),
          function (item) {previousSelection[item.id] = item;}
        );
        this._deleteSavedModelComponents();

        var models = globals.models.map(function (model) {
          return new ModelComponentParameters(model, previousSelection[model.id]);
        });

        _.each(models, function (item) {
          $('#choices-multiple-remove-button').append(
            "<option value=" + item.id + " " + (item.selected ? 'selected' : '') + ">" + item.name + "</option>"
          );
          $('#composed_model_compute').data(item.id, item);
        });
        // create a Choices modified template
        var choices = new Choices('#choices-multiple-remove-button', {
          removeItemButton: true,
          callbackOnCreateTemplates: function (template) {
            return {
              item: function (classNames, data) {
                data = $('#composed_model_compute').data(classNames.value);

                // NOTE: The inline onclicks with stopPropagation event handlers
                // are needed to prevent execution of the bound Choices' onclick
                // and onkeydown event handlers, which render the forms unclickable.

                // prevent click from Choices, focus and select the form
                var onClickHandler = 'event.stopPropagation();event.target.focus();event.target.select();';
                // prevent focus and writing into search div of choices
                var onKeyDownHandler = 'event.stopPropagation();';
                var updateMinDegree = [
                  "var dataParent = $(this)[0].parentNode.parentNode.getAttribute('data-value');",
                  "var data = $('#composed_model_compute').data(dataParent);",
                  "var _old, _new;",
                  "$(this).val(_new = data.setMinDegree(_old = $(this).val()));",
                  "if (_old != _new) {$('#changesbutton').addClass('unAppliedChanges');}"
                ].join('');
                var updateMaxDegree = [
                  "var dataParent = $(this)[0].parentNode.parentNode.getAttribute('data-value');",
                  "var data = $('#composed_model_compute').data(dataParent);",
                  "var _old, _new;",
                  "$(this).val(_new = data.setMaxDegree(_old = $(this).val()));",
                  "if (_old != _new) {$('#changesbutton').addClass('unAppliedChanges');}"
                ].join('');
                var switchSign = [
                  "event.stopPropagation();",
                  "var dataParent = $(this)[0].parentNode.getAttribute('data-value');",
                  "var data = $('#composed_model_compute').data(dataParent);",
                  "$(this).attr('value', {'+': '+', '-': '&minus;'}[data.toggleSign()]);",
                  "$('#changesbutton').addClass('unAppliedChanges');"
                ].join('');
                var showInfo = [
                  "event.stopPropagation();",
                  "var dataParent = $(this)[0].parentNode.getAttribute('data-value');",
                  "var modelData = $('#composed_model_compute').data(dataParent);",
                  "if (typeof $('.model-sources-label').data('id') !== 'undefined' && $('.model-sources-label').data('id') == modelData.id){",
                  "$('.model-sources-label').toggleClass('hidden');",
                  "}else{",
                  "$('.model-sources-label').removeClass('hidden');",
                  "$('.model-sources-label').html('');",
                  "$('.model-sources-label').data('id', modelData.id);",
                  "$('.model-sources-label').append('<button>&times;</button>');",
                  "$('.model-sources-label').append('<h4>Model sources:</h4>');",
                  "$('.model-sources-label').append('<ul></ul>');",
                  "for (var i = 0; i < modelData.sources.length; i++) {$('.model-sources-label > ul').append('<li>' + modelData.sources[i] + '</li>');}",
                  "$('.model-sources-label > button').addClass('close close-model-sources');",
                  "$('.model-sources-label').offset({left: event.clientX - 20 - parseInt($('.model-sources-label').outerWidth(true)), top: event.clientY - 15});",
                  "$('.close-model-sources').off('click');",
                  "$('.close-model-sources').on('click', function(){$('.model-sources-label').addClass('hidden')}); }",
                ].join('');

                var html = [
                  '<div class="choices__item choices__item--selectable data-item composed_model_choices_holding_div" data-id="', classNames.id, '" data-value="', classNames.value, '" data-deletable>',
                  '<input type="button" value="', data.signToHtml[data.sign], '" class="composed_model_operation_operand btn-info" title="Change model sign" onclick="', switchSign, '">',
                  '<span class="composed_model_operation_label">', data.name, '</span>',
                  '<button type="button" class="composed_model_delete_button choices__button" data-button>Remove item</button>',
                  '<div class="degree_range_selection_input">'
                ];
                if (data.allowDegreeSelection) {
                  html = html.concat([
                    '<input type="text" placeholder="', data.defaults.min_degree, '" value="', data.getMinDegree(), '" onclick="', onClickHandler, '" onkeydown="', onKeyDownHandler, '" onblur="', updateMinDegree, '" class="composed_model_operation_coefficient_min" title="Minimum model degree.">',
                    '<input type="text" placeholder="', data.defaults.max_degree, '" value="', data.getMaxDegree(), '" onclick="', onClickHandler, '" onkeydown="', onKeyDownHandler, '" onblur="', updateMaxDegree, '" class="composed_model_operation_coefficient_max" title="Maximum model degree.">'
                  ]);
                }
                html = html.concat([
                  '</div>',
                  '<i type="button" class="composed_model_info_button fa fa-info-circle btn-info" title="Show model sources" onclick="', showInfo, '"></i>',
                  '</div>'
                ]);

                return template(html.join(''));
              }
            };
          }
        });
        choices.passedElement.addEventListener('addItem', _.bind(function (event) {
          var items = $('#composed_model_compute').data();
          var thisItem = $('#composed_model_compute').data(event.detail.value);
          thisItem.selected = true;
          this._activateApplyButton();
          // remove colliding models
          _.each(items, function (item) {
            if (thisItem.excludes[item.id] && item.selected) {
              choices.removeItemsByValue(item.id);
            }
          });
        }, this));
        choices.passedElement.addEventListener('removeItem', _.bind(function (event) {
          $('#composed_model_compute').data(event.detail.value).selected = false;
          this._activateApplyButton();
          $('.model-sources-label').addClass('hidden');
        }, this));
      },

      _checkComposedModelChanges: function () {
        if ($('.composed_model_operation_operand').length === 0) {
          showMessage('warning', 'The composed model is empty. Please add at least one model.', 20);
          return true;
        }
        return false;
      },

      _applyComposedModelChanges: function () {
        var newComponents = this._getSelectedComponents();
        var modelChanged = !this._modelComponentsAreEqual(
          this.current_model.get('components'), newComponents
        );
        if (modelChanged) {
          console.log(`Composed model ${this.current_model.get("name")} changed`);
          this.current_model.set("components", newComponents);
        }
        this._deleteSavedModelComponents();
        return modelChanged;
      },

      _saveModelComponents: function () {
        // save current state of the composed model section
        this._cachedModelComponents = this._getSelectedComponents();
      },

      _loadSavedModelComponents: function () {
        // get saved composed model selection
        return this._cachedModelComponents || null;
      },

      _deleteSavedModelComponents: function () {
        // clear saved composed model selection
        delete this._cachedModelComponents;
      },

      _getSelectedComponents: function () {
        var selectedModels = _.filter(
          $('#composed_model_compute').data(),
          function (item) {return item.selected;}
        );
        return _.map(selectedModels, function (item) {
          return {
            id: item.id,
            sign: item.sign,
            parameters: _.clone(item.parameters)
          };
        });
      },

      _modelComponentsAreEqual: function (list0, list1) {
        // return true for equal lists of model components
        if (list0.length !== list1.length) {
          return false;
        }

        list0 = _.sortBy(list0, function (item) {return item.id;});
        list1 = _.sortBy(list1, function (item) {return item.id;});

        var index;
        for (index = 0; index < list0.length; index++) {
          if (!_.isEqual(list0[index], list1[index])) {
            return false;
          }
        }
        return true;
      },

    });

    return {LayerSettings: LayerSettings};

  });

}).call(this);
