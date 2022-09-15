/*global _ $ * d3 showMessage getISODateTimeString */
/*global get */

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
                            this.parameters.hasOwnProperty('max_degree') ?
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
                            this.parameters.hasOwnProperty('min_degree') ?
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


        var LayerSettings = Backbone.Marionette.Layout.extend({

            template: {type: 'handlebars', template: LayerSettingsTmpl},
            className: "panel panel-default optionscontrol not-selectable",

            initialize: function (options) {
                this.colorscales = _.sortBy(_.keys(colormap.colorscaleDefinitions));

                this.selected = null;
                this.selected_satellite = "Alpha";
            },

            renderView: function () {

                // Unbind first to make sure we are not binding to many times
                this.stopListening(Communicator.mediator, "layer:settings:changed", this.onParameterChange);

                // Event handler to check if tutorial banner made changes to a model in order to redraw settings
                // If settings open rerender view to update changes
                this.listenTo(Communicator.mediator, "layer:settings:changed", this.onParameterChange);

                // for custom model change to apply in choices list
                this.stopListening(Communicator.mediator, "models:update", this.onParameterChange);
                this.listenTo(Communicator.mediator, 'models:update', this.onParameterChange);

                this.stopListening(Communicator.mediator, 'time:change');
                this.listenTo(Communicator.mediator, 'time:change', this.onTimeChange);

                this.$(".panel-title").html('<h3 class="panel-title"><i class="fa fa-fw fa-sliders"></i> ' + this.current_model.get("name") + ' Settings</h3>');

                this.$('.close').on("click", _.bind(this.onClose, this));
                this.$el.draggable({
                    containment: "#main",
                    scroll: false,
                    handle: '.panel-heading'
                });

                var options = _.clone(this.current_model.get("parameters"));

                // filter out hidden parameters
                _.each(options, function (value, key) {
                    if (get(value, 'hidden', false)) {
                        delete options[key];
                    }
                });

                //var height = this.current_model.get("height");
                var outlines = this.current_model.get("outlines");
                var showColorscale = this.current_model.get("showColorscale");
                //var protocol = this.current_model.get("views")[0].protocol;
                //var contours = this.current_model.get("contours");

                this.$("#options").empty();
                this.$("#options").append(
                    _.map(options, function (value, key) {
                        var selected = "";
                        if (value.selected) {
                            this.selected = key;
                            selected = " selected";
                        }
                        return '<option value="' + key + '"' + selected + '>' + value.name + '</option>';
                    }, this).join('')
                );

                // Check if selected is not inside the available options
                // This happens if residuals were selected for the layer and
                // then the model was removed also removing the residuals parameter
                // from the context menu.
                // If this happens the visualized parameter needs to be changed
                if (!options.hasOwnProperty(this.selected)) {
                    this.onOptionsChanged();
                } else {
                    var selectedOption = options[this.selected];

                    if (selectedOption.description) {
                        this.$("#description").text(selectedOption.description);
                    }

                    if (selectedOption.hasOwnProperty("logarithmic")) {
                        this.addLogOption(options);
                    }

                    // Add event handler for change in drop down selection
                    this.$("#options").unbind();
                    this.$("#options").change(this.onOptionsChanged.bind(this));

                    this.$("#range_min").hide();
                    this.$("#range_max").hide();
                    this.$("#colorscale").hide();
                    $("#opacitysilder").parent().hide();

                    if (get(selectedOption, 'allowLayerSettings', true)) {
                        this.$("#range_min").show();
                        this.$("#range_max").show();
                        this.$("#colorscale").show();
                        $("#opacitysilder").parent().show();
                        // Set values for color scale ranges
                        this.$("#range_min").val(selectedOption.range[0]);
                        this.$("#range_max").val(selectedOption.range[1]);

                        // Register necessary key events
                        this.registerKeyEvents(this.$("#range_min"));
                        this.registerKeyEvents(this.$("#range_max"));

                        this.$("#style").unbind();
                        this.$("#style").empty();
                        this.$("#style").append(
                            _.map(this.colorscales, function (colorscale) {
                                var selected = "";
                                if (selectedOption.colorscale == colorscale) {
                                    selected = " selected";
                                }
                                return '<option value="' + colorscale + '"' + selected + '>' + colorscale + '</option>';
                            }).join('')
                        );
                        this.$("#style").change(_.bind(function (evt) {
                            var selected = $(evt.target).find("option:selected").text();
                            options[this.selected].colorscale = selected;
                            this.current_model.set("parameters", options);
                            if (selectedOption.hasOwnProperty("logarithmic")) {
                                this.createScale(selectedOption.logarithmic);
                            } else {
                                this.createScale();
                            }
                            Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"), true);
                        }, this));

                        this.$("#opacitysilder").unbind();
                        this.$("#opacitysilder").val(this.current_model.get("opacity") * 100);
                        this.$("#opacitysilder").on("input change", _.bind(function (evt) {
                            var opacity = Number(evt.target.value) / 100;
                            this.current_model.set("opacity", opacity);
                            Communicator.mediator.trigger('productCollection:updateOpacity', {model: this.current_model, value: opacity});
                        }, this));
                    }


                    var checked;
                    if (!(typeof outlines === 'undefined')) {
                        checked = "";
                        if (outlines)
                            checked = "checked";

                        $("#outlines input").unbind();
                        $("#outlines").empty();
                        this.$("#outlines").append(
                            '<form style="vertical-align: middle;">' +
                            '<label class="valign" for="outlines" style="width: 120px;">Outlines </label>' +
                            '<input class="valign" style="margin-top: -5px;" type="checkbox" name="outlines" value="outlines" ' + checked + '></input>' +
                            '</form>'
                        );

                        this.$("#outlines input").change(_.bind(function (evt) {
                            var outlines = !this.current_model.get("outlines");
                            this.current_model.set("outlines", outlines);
                            Communicator.mediator.trigger("layer:outlines:changed", this.current_model.get("views")[0].id, outlines);
                        }, this));
                    }

                    if (!(typeof showColorscale === 'undefined')) {
                        checked = "";
                        if (showColorscale)
                            checked = "checked";

                        $("#showColorscale input").unbind();
                        $("#showColorscale").empty();
                        this.$("#showColorscale").append(
                            '<form style="vertical-align: middle;">' +
                            '<label class="valign" for="outlines" style="width: 120px; margin">Legend </label>' +
                            '<input class="valign" style="margin-top: -5px;" type="checkbox" name="outlines" value="outlines" ' + checked + '></input>' +
                            '</form>'
                        );

                        this.$("#showColorscale input").change(_.bind(function (evt) {
                            var showColorscale = !this.current_model.get("showColorscale");
                            this.current_model.set("showColorscale", showColorscale);
                            Communicator.mediator.trigger("layer:colorscale:show", this.current_model.get("download").id);
                        }, this));
                    }

                    this.createScale(
                        selectedOption.hasOwnProperty("logarithmic") &&
                        selectedOption.logarithmic
                    );

                    if (this.current_model.get("model") && this.current_model.get("editable")) {
                        this.createCustomModelSelection();
                        this.createApplyButton();
                        this.createComposedModelSelection();
                    } else {
                        this.$("#composed_model_compute").empty();
                    }

                    this.createHeightTextbox(this.current_model.get("height"));
                }

                if (this.selected == "Fieldlines") {
                    $("#coefficients_range").hide();
                    $("#opacitysilder").parent().hide();
                    // Check if there is a selection available if not, show message

                    // Check for possible already available selection
                    if (this.current_model.id.indexOf('PPI') === -1 &&
                      (localStorage.getItem('areaSelection') === null ||
                       !JSON.parse(localStorage.getItem('areaSelection')))) {
                        showMessage(
                            'warning',
                            'In order to visualize fieldlines please select an area using the "Select Area" button in the globe view. Click on a fieldline to display additional information.',
                            35
                        );
                    }
                } else {
                    $("#coefficients_range").show();
                }
                this.$el.append('<div class="model-sources-label hidden sourcesInfoContainer"></div>');
            },

            createCustomModelSelection: function () {
                this.$("#shc").empty();
                this.$("#shc").append(
                    '<p>Spherical Harmonics Coefficients</p>' +
                    '<div class="myfileupload-buttonbar ">' +
                        '<label class="btn btn-default shcbutton">' +
                        '<span><i class="fa fa-fw fa-upload"></i> Upload SHC File</span>' +
                        '<input id="upload-selection" type="file" accept=".shc" name="files[]" />' +
                      '</label>' +
                  '</div>'
                );

                this.$("#upload-selection").unbind();
                this.$("#upload-selection").change(
                    _.bind(this.onCustomModelUpload, this)
                );
                var customModel = this.current_model.getCustomModelIfSelected();
                if (customModel) {
                    this.$("#shc").append('<p id="filename" style="font-size:.9em;">Selected File: ' + customModel.get('filename') + '</p>');
                }
            },

            onShow: function (view) {
                var that = this;

                if (this.model.get("containerproduct")) {
                    // Add options for three satellites
                    $("#satellite_selection").off();
                    $("#satellite_selection").empty();
                    $("#satellite_selection").append('<label for="satellite_selec" style="width:120px;">Satellite </label>');
                    $("#satellite_selection").append('<select style="margin-left:4px;" name="satellite_selec" id="satellite_selec"></select>');

                    if (globals.swarm.products.hasOwnProperty(this.model.get('id'))) {
                        var options = Object.keys(globals.swarm.products[this.model.get('id')]);
                        for (var i = 0; i < options.length; i++) {
                            var selected = '';
                            if (options[i] == 'Alpha') {
                                selected = 'selected';
                            }
                            $('#satellite_selec').append('<option value="' + options[i] + '"' + selected + '>' + options[i] + '</option>');
                        }
                    }

                    $("#satellite_selec option[value=" + this.selected_satellite + "]").prop("selected", "selected");

                    var model = null;
                    globals.products.forEach(function (p) {
                        if (p.get("download").id == globals.swarm.products[that.model.get("id")][that.selected_satellite]) {
                            model = p;
                        }
                    });
                    this.current_model = model;

                    $("#satellite_selection").on('change', function () {
                        that.selected_satellite = $("#satellite_selection").find("option:selected").val();
                        var model = null;
                        globals.products.forEach(function (p) {
                            if (p.get("download").id == globals.swarm.products[that.model.get("id")][that.selected_satellite]) {
                                model = p;
                            }
                        });
                        that.current_model = model;
                        that.renderView();
                    });

                } else {
                    this.current_model = this.model;
                }
                this.renderView();
            },

            onClose: function () {
                this.deleteSavedModelComponents();
                this.close();
            },

            onParameterChange: function () {
                this.saveModelComponents();
                this.onShow();
            },

            onOptionsChanged: function () {
                var options = this.current_model.get("parameters");

                if (options.hasOwnProperty(this.selected)) {
                    delete options[this.selected].selected;
                }

                $("#description").empty();

                this.selected = $("#options").find("option:selected").val();
                var selectedOption = options[this.selected];

                this.$("#style").empty();

                this.$("#range_min").hide();
                this.$("#range_max").hide();
                this.$("#colorscale").hide();
                $("#opacitysilder").parent().hide();

                if (get(selectedOption, 'allowLayerSettings', true)) {

                    this.$("#range_min").show();
                    this.$("#range_max").show();
                    this.$("#colorscale").show();
                    $("#opacitysilder").parent().show();

                    this.$("#style").append(
                        _.map(this.colorscales, function (colorscale) {
                            var selected = "";
                            if (selectedOption.colorscale == colorscale) {
                                selected = " selected";
                            }
                            return '<option value="' + colorscale + '"' + selected + '>' + colorscale + '</option>';
                        }).join('')
                    );

                    $("#range_min").val(selectedOption.range[0]);
                    $("#range_max").val(selectedOption.range[1]);

                    this.createScale(); // logarithmic ?
                }

                if (selectedOption.hasOwnProperty("logarithmic")) {
                    this.addLogOption(options);
                } else {
                    this.$("#logarithmic").empty();
                }

                selectedOption.selected = true;

                if (selectedOption.description) {
                    this.$("#description").text(selectedOption.description);
                }

                this.createHeightTextbox(this.current_model.get("height"));

                if (this.selected == "Fieldlines") {
                    $("#coefficients_range").hide();
                    $("#opacitysilder").parent().hide();
                    // Check for possible already available selection
                    if (this.current_model.id.indexOf('PPI') === -1 &&
                      (localStorage.getItem('areaSelection') === null ||
                       !JSON.parse(localStorage.getItem('areaSelection')))) {
                        showMessage(
                            'warning',
                            'In order to visualize fieldlines please select an area using the "Select Area" button in the globe view. Click on a fieldline to display additional information.',
                            35
                        );
                    }
                } else {
                    $("#coefficients_range").show();
                }

                // request range for selected parameter if layer is of type model
                if (this.current_model.get("model") && this.selected !== "Fieldlines") {
                    this.updateComposedModelValuesRange();
                } else {
                    Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
                }

            },

            registerKeyEvents: function (el) {
                var that = this;
                el.keypress(function (evt) {
                    if (evt.keyCode == 13) { //Enter pressed
                        evt.preventDefault();
                        that.applyChanges();
                    } else {
                        that.createApplyButton();
                    }
                });

                el.keyup(function (evt) {
                    if (evt.keyCode == 8) { //Backspace clicked
                        that.createApplyButton();
                    }
                });

                // Add click event to select text when clicking or tabbing into textfield
                el.click(function () {$(this).select();});
            },

            createApplyButton: function () {
                var that = this;
                if ($("#changesbutton").length == 0) {
                    $("#applychanges").append('<button type="button" class="btn btn-default" id="changesbutton" style="width: 100%;"> Apply changes </button>');
                    $("#changesbutton").click(function (evt) {
                        that.applyChanges();
                    });
                }
            },

            handleRangeRespone: function (response) {
                var options = this.current_model.get("parameters");
                var resp = response.split(',');
                var range = [Number(resp[1]), Number(resp[2])];
                if (!isNaN(range[0]) && !isNaN(range[1])) {
                    // Make range "nicer", rounding depending on extent
                    range = d3.scale.linear().domain(range).nice().domain();
                    $("#range_min").val(range[0]);
                    $("#range_max").val(range[1]);
                    options[this.selected].range = range;
                    this.current_model.set("parameters", options);
                    this.createScale();
                }
                Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
            },

            handleRangeResponeSHC: function (evt, response) {
                this.handleRangeRespone(response);
                var params = {name: this.current_model.get("download").id, isBaseLayer: false, visible: false};
                Communicator.mediator.trigger('map:layer:change', params);
                Communicator.mediator.trigger("file:shc:loaded", evt.target.result);
                Communicator.mediator.trigger("layer:activate", this.current_model.get("views")[0].id);
            },

            handleRangeResponseError: function (response) {
                showMessage(
                    'warning',
                    'There is a problem requesting the range values for the color scale,' +
                    ' please revise and set them to adequate values if necessary.', 15
                );
            },

            applyChanges: function () {
                var options = this.current_model.get("parameters");
                var isEditableModel = (
                    this.current_model.get("model") &&
                    this.current_model.get("editable")
                );

                var error = false;
                var modelChanged = false;
                var heightChanged = false;
                var rangeChanged = false;

                // Check color ranges
                var range_min = parseFloat($("#range_min").val());
                error = error || this.checkValue(range_min, $("#range_min"));

                var range_max = parseFloat($("#range_max").val());
                error = error || this.checkValue(range_max, $("#range_max"));

                // Set range parameters and redraw color scale
                if (!error) {
                    var old_range = options[this.selected].range;
                    if (typeof old_range !== 'undefined' && (old_range[0] !== range_min || old_range[1] !== range_max)) {
                        rangeChanged = true;
                    }
                    options[this.selected].range = [range_min, range_max];

                    if (options[this.selected].hasOwnProperty("logarithmic"))
                        this.createScale(options[this.selected].logarithmic);
                    else
                        this.createScale();
                }

                // Check for height attribute
                if ($("#heightvalue").length) {
                    var height = parseFloat($("#heightvalue").val());
                    error = error || this.checkValue(height, $("#heightvalue"));

                    if (!error) {
                        if (this.current_model.get("height") != height) {
                            heightChanged = true;
                        }
                        this.current_model.set("height", height);
                    }
                }

                if (isEditableModel) {
                    error = error || this.checkComposedModelChanges();
                }

                if (error) {
                    return;
                }

                if (isEditableModel) {
                    modelChanged = this.applyComposedModelChanges();
                    $("#changesbutton").removeClass("unAppliedChanges");
                } else {
                    // remove button for non-composed models
                    $("#applychanges").empty();
                }

                //Apply changes
                this.current_model.set("parameters", options);

                if ((modelChanged || heightChanged) && this.selected !== 'Fieldlines') {
                    this.updateComposedModelValuesRange();
                } else if (rangeChanged && this.selected === 'Fieldlines')
                {
                    Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"), true);
                } else {
                    Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
                }
                if (modelChanged && this.current_model.get("visible")) {
                    Communicator.mediator.trigger("model:change", this.current_model.get("download").id);
                }
            },

            checkValue: function (value, textfield) {
                if (isNaN(value)) {
                    textfield.addClass("text_error");
                    return true;
                } else {
                    textfield.removeClass("text_error");
                    return false;
                }
            },

            setModel: function (model) {
                this.model = model;
            },

            sameModel: function (model) {
                return this.model.get("name") == model.get("name");
            },

            onCustomModelUpload: function (evt) {
                var reader = new FileReader();
                var filename = evt.target.files[0].name;
                reader.onloadend = _.bind(function (evt) {
                    $("#changesbutton").addClass("unAppliedChanges");

                    // save SHC file to localstorage
                    localStorage.setItem('shcFile', JSON.stringify({
                        filename: filename,
                        data: evt.target.result
                    }));

                    // update the source custom model
                    globals.models.setCustomModel(evt.target.result, filename);

                    if (this.current_model.getCustomModelIfSelected()) {
                        this.updateComposedModelValuesRange();
                        Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
                        if (this.current_model.get("visible")) {
                            Communicator.mediator.trigger("model:change", this.current_model.get("download").id);
                        }
                    }
                    this.saveModelComponents();
                    this.onShow();
                }, this);

                reader.readAsText(evt.target.files[0]);
            },

            addLogOption: function (options) {
                var that = this;
                if (options[this.selected].hasOwnProperty("logarithmic")) {
                    var checked = "";
                    if (options[this.selected].logarithmic)
                        checked = "checked";

                    this.$("#logarithmic").empty();

                    this.$("#logarithmic").append(
                        '<form style="vertical-align: middle;">' +
                        '<label class="valign" for="outlines" style="width: 100px;">Log. Scale</label>' +
                        '<input class="valign" style="margin-top: -5px;" type="checkbox" name="logarithmic" value="logarithmic" ' + checked + '></input>' +
                        '</form>'
                    );

                    this.$("#logarithmic input").change(function (evt) {
                        var options = that.current_model.get("parameters");
                        options[that.selected].logarithmic = !options[that.selected].logarithmic;

                        that.current_model.set("parameters", options);
                        Communicator.mediator.trigger("layer:parameters:changed", that.current_model.get("name"), true);

                        if (options[that.selected].hasOwnProperty("logarithmic"))
                            that.createScale(options[that.selected].logarithmic);
                        else
                            that.createScale();
                    });
                }
            },

            createScale: function (logscale) {
                /*
                var superscript = "⁰¹²³⁴⁵⁶⁷⁸⁹";
                var formatPower = function (d) {
                    if (d >= 0)
                        return (d + "").split("").map(function (c) {return superscript[c];}).join("");
                    else if (d < 0)
                        return "⁻" + (d + "").split("").map(function (c) {return superscript[c];}).join("");
                };
                */
                $("#setting_colorscale").empty();

                if (!get(this.current_model.get("parameters")[this.selected], 'allowLayerSettings', true)) {
                    return;
                }

                var margin = 20;
                var width = $("#setting_colorscale").width();
                var scalewidth = width - margin * 2;

                var range_min = this.current_model.get("parameters")[this.selected].range[0];
                var range_max = this.current_model.get("parameters")[this.selected].range[1];
                var uom = this.current_model.get("parameters")[this.selected].uom;
                var style = this.current_model.get("parameters")[this.selected].colorscale;

                $("#setting_colorscale").append(
                    '<div id="gradient" style="width:' + scalewidth + 'px;margin-left:' + margin + 'px"></div>'
                );
                /*'<div class="'+style+'" style="width:'+scalewidth+'px; height:20px; margin-left:'+margin+'px"></div>'*/

                var data_url = (new colormap.ColorMap(style)).getCanvas().toDataURL('image/png');
                $('#gradient').css('background-image', 'url(' + data_url + ')');

                var svgContainer = d3.select("#setting_colorscale").append("svg")
                    .attr("width", width)
                    .attr("height", 40);

                var axisScale;

                if (logscale) {
                    axisScale = d3.scale.log();
                } else {
                    axisScale = d3.scale.linear();
                }

                axisScale.domain([range_min, range_max]);
                axisScale.range([0, scalewidth]);

                var xAxis = d3.svg.axis()
                    .scale(axisScale);

                if (logscale) {
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

            createHeightTextbox: function (height) {
                this.$("#height").empty();
                if ((height || height == 0) && this.selected !== "Fieldlines") {
                    this.$("#height").append(
                        '<form style="vertical-align: middle;">' +
                        '<label for="heightvalue" style="width: 120px;">Height</label>' +
                        '<input id="heightvalue" type="text" style="width:35px; margin-left:8px"/>' +
                        '</form>'
                    );
                    this.$("#heightvalue").val(height);
                    this.$("#height").append(
                        '<p style="font-size:0.85em; margin-left: 120px;">Above ellipsoid (Km)</p>'
                    );

                    // Register necessary key events
                    this.registerKeyEvents(this.$("#heightvalue"));
                }
            },

            updateComposedModelValuesRange: function () {
                var sel_time = Communicator.reqres.request('get:time');

                var options = {
                    model_expression: this.current_model.getModelExpression(),
                    shc: this.current_model.getCustomShcIfSelected(),
                    variable: this.selected,
                    begin_time: getISODateTimeString(sel_time.start),
                    end_time: getISODateTimeString(sel_time.end),
                    elevation: this.current_model.get("height"),
                    height: 24,
                    width: 24,
                    getonlyrange: true
                };

                var payload = evalModelTmplComposed_POST(options);

                $.post(this.current_model.get("download").url, payload)
                    .success(this.handleRangeRespone.bind(this))
                    .fail(this.handleRangeResponseError);
            },

            createComposedModelSelection: function () {

                //composed model additional fields
                this.$("#composed_model_compute").empty();
                this.$("#composed_model_compute").append(
                    '<select class="form-control" id="choices-multiple-remove-button" ' +
                  'placeholder="Choose model or type its name." multiple></select>'
                );

                // create hash of the previous components
                var previousSelection = {};
                _.each(
                    this.getSavedModelComponents() || this.current_model.get('components'),
                    function (item) {previousSelection[item.id] = item;}
                );
                this.deleteSavedModelComponents();

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
                    $("#changesbutton").addClass("unAppliedChanges");
                    // remove colliding models
                    _.each(items, function (item) {
                        if (thisItem.excludes[item.id] && item.selected) {
                            choices.removeItemsByValue(item.id);
                        }
                    });
                }, this));
                choices.passedElement.addEventListener('removeItem', _.bind(function (event) {
                    $('#composed_model_compute').data(event.detail.value).selected = false;
                    $("#changesbutton").addClass("unAppliedChanges");
                    $('.model-sources-label').addClass('hidden');
                }, this));
            },

            checkComposedModelChanges: function () {
                if ($('.composed_model_operation_operand').length === 0) {
                    showMessage('warning', 'The composed model is empty. Please add at least one model.', 20);
                    return true;
                }

                return false;
            },

            applyComposedModelChanges: function () {
                var newComponents = this._getSelectedComponents();
                var modelChanged = !this._modelComponentsAreEqual(
                    this.current_model.get('components'), newComponents
                );
                if (modelChanged) {
                    console.log("Composed model " + this.current_model.get("name") + " changed");
                    this.current_model.set("components", newComponents);
                }
                this.deleteSavedModelComponents();
                return modelChanged;
            },

            saveModelComponents: function () {
                // save current state of the composed model section
                this._cachedModelComponents = this._getSelectedComponents();
            },

            getSavedModelComponents: function () {
                // get saved composed model selection
                return this._cachedModelComponents || null;
            },

            deleteSavedModelComponents: function () {
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
            onTimeChange: function () {
                $('.model-sources-label').addClass('hidden');
            },
        });

        return {LayerSettings: LayerSettings};

    });

}).call(this);
