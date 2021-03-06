/*global $ _ w2confirm */
/*global getISOTimeString isValidTime parseTime getISODateTimeString */
/*global VECTOR_BREAKDOWN TIMESTAMP */
/*global has get pop */

(function () {
  'use strict';

  var root = this;
  root.define([
    'backbone',
    'communicator',
    'globals',
    'models/DownloadModel',
    'hbs!tmpl/DownloadFilter',
    'hbs!tmpl/FilterTemplate',
    'hbs!tmpl/DownloadProcess',
    'hbs!tmpl/wps_retrieve_data_filtered',
    'hbs!tmpl/CoverageDownloadPost',
    'hbs!tmpl/wps_fetchFilteredDataAsync',
    'dataUtil',
    'underscore',
    'w2ui',
    'w2popup'
  ],
  function (
    Backbone, Communicator, globals, m, DownloadFilterTmpl, FilterTmpl,
    DownloadProcessTmpl, wps_requestTmpl, CoverageDownloadPostTmpl,
    wps_fetchFilteredDataAsync, DataUtil
  ) {

    var ESSENTIAL_PARAMETERS = [TIMESTAMP, "Latitude", "Longitude", "Radius"];
    var EXCLUDED_PARAMETERS = [
      TIMESTAMP, 'q_NEC_CRF', 'GPS_Position', 'LEO_Position', 'EEJ'
    ];

    // TODO: find a better place to put the extra parameters' configuration
    var EXTRA_PARAMETERS = {
      "Dst": {
        "uom": "nT",
        "name": "Disturbance storm time index"
      },
      "dDst": {
        "uom": "nT/h",
        "name": "Absolute value of the temporal change rate of the Dst index"
      },
      "Kp": {
        "uom": null,
        "name": "Global geomagnetic storm index"
      },
      "F107": {
        "uom": "1e-22 J/s/m^2/Hz",
        "name": "Observed 10.7cm solar radio flux"
      },
    };

    var DownloadProcessModel = Backbone.Model.extend({
      refreshTime: 2000, // refresh time in ms
      defaults: {
        id: null,
        fetch_failed: false,
        status_not_found: false,
        creation_time: null,
        status_url: null,
        status: null,
        percentage: 0,
        error: null,
        inputs: {},
        outputs: {},
        output_defs: {}
      },

      url: function () {
        return this.get('status_url');
      },

      fetch: function (options) {
        var extra_options = {
          dataType: 'xml',
          error: _.bind(function (model, response, options) {
            this.set({
              status: null,
              fetch_failed: true,
              status_not_found: (response.status == 404)
            });
          }, this)
        };
        return this.constructor.__super__.fetch.call(
          this, _.extend({}, options, extra_options)
        );
      },

      parse: function (response) {
        var statusInfo = this.parseStatus(response);

        var attributes = _.extend(_.clone(this.attributes), {
          fetch_failed: false,
          status_not_found: false,
          status_url: this.parseStatusUrl(response) || this.get('status_url'),
          status: statusInfo.status,
          percentage: statusInfo.progress,
          error: statusInfo.error || null,
          inputs: this.parseInputs(response),
          outputs: this.parseOutputs(response),
          output_defs: this.parseOutputDefinitions(response)
        });

        if (isActive(statusInfo.status)) {
          setTimeout(_.bind(this.fetch, this), this.refreshTime);
        }

        return attributes;
      },

      parseStatusUrl: function (xml) {
        return $(xml).attr('statusLocation');
      },

      parseStatus: function (xml) {
        var status_ = $(xml).find('wps\\:Status > *')[0];
        if (!status_) {return;}
        switch (splitQName(status_.nodeName).name) {
          case 'ProcessSucceeded':
            return {
              status: 'SUCCEEDED',
              progress: 100
            };
          case 'ProcessFailed':
            var exception = $(status_).find('ExceptionText, ows\\:ExceptionText');
            return {
              status: 'FAILED',
              progress: 0,
              error: exception ? exception.text() : ""
            };
          case 'ProcessStarted':
            return {
              status: 'STARTED',
              progress: Number($(status_).attr('percentCompleted') || 0)
            };
          case 'ProcessAccepted':
            return {
              status: 'ACCEPTED',
              progress: 0
            };
        }
      },

      parseInputs: function (xml) {
        function parseComplexData($data) {
          var mimeType = $data.attr('mimeType');
          var data;
          if (mimeType === 'application/json') {
            data = JSON.parse($data.text());
          } else {
            data = $data.text();
          }
          return {data: data, mimeType: mimeType};
        }

        var inputData = {};
        $(xml)
          .find('wps\\:DataInputs > wps\\:Input')
          .each(function () {
            var id = $(this).find('ows\\:Identifier').text();
            var data = $(this).find('wps\\:Data > *')[0];
            if (!data) {return;}
            switch (splitQName(data.nodeName).name) {
              case 'LiteralData':
                inputData[id] = {
                  data: $(data).text(),
                  dataType: $(data).attr('dataType')
                };
                break;
              case 'ComplexData':
                inputData[id] = parseComplexData($(data));
                break;
              default:
                return;
            }
          });
        return inputData;
      },

      parseOutputDefinitions: function (xml) {
        var outputDefinitions = {};
        $(xml)
          .find('wps\\:OutputDefinitions > wps\\:Output')
          .each(function () {
            var id = $(this).find('ows\\:Identifier').text();
            var def = {};
            $.each(this.attributes, function () {
              if (this.specified) {def[this.name] = this.value;}
            });
            outputDefinitions[id] = def;
          });
        return outputDefinitions;
      },

      parseOutputs: function (xml) {
        var outputData = {};
        $(xml)
          .find('wps\\:ProcessOutputs > wps\\:Output')
          .each(function () {
            var id = $(this).find('ows\\:Identifier').text();
            var ref = $(this).find('wps\\:Reference')[0];
            if (!ref) {return;}
            outputData[id] = {
              url: $(ref).attr('href'),
              dataType: $(ref).attr('dataType')
            };
          });
        return outputData;
      }

    });

    var DownloadProcessView = Backbone.Marionette.ItemView.extend({
      tagName: "div",
      el: '#download_processes',
      //id: "modal-start-download",
      className: "download_process",
      template: {
        type: 'handlebars',
        template: DownloadProcessTmpl
      },

      modelEvents: {
        "change": "render"
      },

      onBeforeRender: function () {
        this.collapse_open = $('#collapse-' + this.model.get('id')).hasClass('in');
      },

      onRender: function () {
        if (this.collapse_open) {
          $('#collapse-' + this.model.get('id')).addClass('in');
          $('#' + this.model.get('id') + ' a').removeClass('collapsed');
        }

        var currentStatus = this.model.get('status');
        var previousStatus = this.model.previous('status');

        if (isActive(currentStatus)) {
          disableDownloadButton();
        } else if (isActive(previousStatus)) {
          enableDownloadButton();
        }
      },

      initialize: function (options) {},
      onShow: function (view) {},

      templateHelpers: function (options) {
        var download = this.model.get('outputs').output || {};
        return {
          message: this.getMessage(),
          download_url: download.url,
          details: this.getJobParameters()
        };
      },

      getMessage: function () {
        switch (this.model.get('status')) {
          case 'SUCCEEDED':
            return 'Ready';
          case 'FAILED':
            return 'Error while processing';
          case 'STARTED':
            return this.model.get('percentage') + '%';
          case 'ACCEPTED':
            return 'Starting process ...';
          default:
            return 'Loading ...';
        }
      },

      getJobParameters: function () {
        var inputs = this.model.get('inputs');
        var output_defs = this.model.get('output_defs');
        var outputs = this.model.get('outputs');

        var info = _.chain(this.DISPLAYED_INPUTS)
          .filter(function (inputId) {return inputs[inputId];})
          .map(function (inputId) {
            var input = inputs[inputId];
            var formatter = this.inputFormatters[inputId];
            if (formatter) {
              return formatter(input);
            }
            return {label: inputId, body: input.data};
          }, this)
          .value();

        if (output_defs.output && output_defs.output.mimeType) {
          info.push({label: 'Output format', body: output_defs.output.mimeType});
        }

        if (outputs.source_products && outputs.source_products.url) {
          info.push({
            label: 'List of source products',
            body: '<a href="' + outputs.source_products.url + ' " target="_blank" download="">download</a>'
          });
        }

        return info;
      },

      DISPLAYED_INPUTS: [
        'collection_ids', 'model_ids', 'begin_time', 'end_time', 'filters',
      ],

      inputFormatters: {
        collection_ids: function (input) {
          return {
            label: 'Selected products',
            body: _.map(_.keys(input.data).sort(), function (key) {
              return '<br>&nbsp;&nbsp;&nbsp;&nbsp;' + key + ': ' + input.data[key].join(', ');
            }).join('')
          };
        },
        model_ids: function (input) {
          return {
            label: 'Models',
            body: input.data,
          };
        },
        begin_time: function (input) {
          return {
            label: 'Start time',
            body: input.data,
          };
        },
        end_time: function (input) {
          return {
            label: 'End time',
            body: input.data,
          };
        },
        filters: function (input) {
          return {
            label: 'Filters',
            body: input.data,
          };
        },
      }
    });

    function enableDownloadButton() {
      $('#btn-start-download').prop('disabled', false);
      $('#btn-start-download').removeAttr('title');
    }

    function disableDownloadButton() {
      $('#btn-start-download').prop('disabled', true);
      $('#btn-start-download').attr('title', 'Please wait until previous process is finished');
    }

    function splitQName(name) {
      var tmp = name.split(':');
      if (tmp.length > 1) {
        return {prefix: tmp[0], name: tmp[1]};
      } else {
        return {name: tmp[0]};
      }
    }

    function isActive(status) {
      return status && (status !== 'SUCCEEDED') && (status !== 'FAILED');
    }

    var DownloadFilterView = Backbone.Marionette.ItemView.extend({
      tagName: "div",
      id: "modal-start-download",
      className: "panel panel-default download",
      template: {
        type: 'handlebars',
        template: DownloadFilterTmpl
      },

      initialize: function (options) {
        this.coverages = new Backbone.Collection([]);
        this.start_picker = null;
        this.end_picker = null;
        this.models = [];
        this.swarm_prod = [];
        this.loadcounter = 0;
        this.currentFilters = {};
        this.tabindex = 1;
      },

      createSubscript: function createSubscript(string) {
        // Adding subscript elements to string which contain underscores
        var newkey = "";
        var parts = string.split("_");
        if (parts.length > 1) {
          newkey = parts[0];
          for (var i = 1; i < parts.length; i++) {
            newkey += (" " + parts[i]).sub();
          }
        } else {
          newkey = string;
        }
        return newkey;
      },

      handleItemSelected: function handleItemSelected(evt) {
        var selected = $('#addfilter').val();
        if (selected !== '') {
          this.currentFilters[selected] = [0, 0];
          this.renderFilterList();
        }
      },

      onShow: function (view) {

        this.listenTo(this.coverages, "reset", this.onCoveragesReset);
        this.$('.close').on("click", _.bind(this.onClose, this));
        this.$el.draggable({
          containment: "#content",
          scroll: false,
          handle: '.panel-heading'
        });

        this.$('#btn-start-download').on("click", _.bind(this.onStartDownloadClicked, this));

        $('#validationwarning').remove();

        this.updateJobs();

        // Check for filters

        var filters = this.model.get("filter");
        if (typeof filters === 'undefined') {
          filters = {};
        }

        var aoi = this.model.get("AoI");
        if (aoi) {
          filters["Longitude"] = [aoi.w, aoi.e];
          filters["Latitude"] = [aoi.s, aoi.n];
        }

        this.currentFilters = filters;

        this.renderFilterList();

        // Check for products and models
        var products;
        this.models = [];
        this.swarm_prod = [];

        // Initialise datepickers
        $.datepicker.setDefaults({
          showOn: "both",
          dateFormat: "dd.mm.yy"
        });

        var timeinterval = this.model.get("ToI");

        this.start_picker = this.$('#starttime').datepicker({
          onSelect: _.bind(function () {
            var start = this.start_picker.datepicker("getDate");
            var end = this.end_picker.datepicker("getDate");
            if (start > end) {
              this.end_picker.datepicker("setDate", start);
            }
          }, this)
        });
        this.start_picker.datepicker("setDate", timeinterval.start);

        this.end_picker = this.$('#endtime').datepicker({
          onSelect: _.bind(function () {
            var start = this.start_picker.datepicker("getDate");
            var end = this.end_picker.datepicker("getDate");
            if (end < start) {
              this.start_picker.datepicker("setDate", end);
            }
          }, this)
        });
        this.end_picker.datepicker("setDate", timeinterval.end);

        // Prepare to create list of available parameters
        var available_parameters = [];

        products = this.model.get("products");
        // Separate models and Swarm products and add lists to ui
        _.each(products, function (prod) {

          if (prod.get("download_parameters")) {
            var par = prod.get("download_parameters");
            var new_keys = _.keys(par);
            _.each(new_keys, function (key) {
              if (!_.find(available_parameters, function (item) {
                return item.id == key;
              })) {
                available_parameters.push({
                  id: key,
                  uom: par[key].uom,
                  description: par[key].name,
                });
              }
            });
          }

          if (prod.get("processes")) {
            var result = $.grep(prod.get("processes"), function (e) {return e.id == "retrieve_data";});
            if (result)
              this.swarm_prod.push(prod);
          }

          if (prod.get("model")) {
            this.models.push(prod);
          }
        }, this);

        var prod_div = this.$el.find("#productsList");
        prod_div.append('<div style="font-weight:bold;">Products</div>');

        prod_div.append('<ul style="padding-left:15px">');
        var ul = prod_div.find("ul");
        _.each(this.swarm_prod, function (prod) {
          ul.append('<li style="list-style-type: circle; padding-left:-6px;list-style-position: initial;">' + prod.get("name") + '</li>');
        }, this);

        if (this.models.length > 0) {
          var mod_div = this.$el.find("#model");
          mod_div.append('<div><b>Models</b></div>');
          mod_div.append('<ul style="padding-left:15px">');
          ul = mod_div.find("ul");
          _.each(this.models, function (prod) {
            ul.append('<li style="list-style-type: circle; padding-left:-6px;list-style-position: initial;">' + prod.getPrettyModelExpression() + '</li>');
          }, this);
        }

        this.$el.find("#custom_parameter_cb").off();
        this.$el.find("#custom_download").empty();
        this.$el.find("#custom_download").html(
          '<div class="w2ui-field">' +
              '<div class="checkbox" style="margin-left:20px;"><label><input type="checkbox" value="" id="custom_parameter_cb">Custom download parameters</label></div>' +
              '<div style="margin-left:0px;"> <input id="param_enum" style="width:100%;"> </div>' +
          '</div>'
        );

        var subsetting_cb = '<div class="checkbox"><label><input type="checkbox" value="" id="custom_subsetting_cb">Custom time subsampling</label></div>';
        var subsettingFilter =
          '<div class="input-group" id=custom_subsetting_filter style="margin:7px">' +
            '<span class="form-control">' +
              'Time subsetting (Expected format ISO-8601 duration e.g. PT1H10M30S)' +
              '<textarea id="custom_subsetting_ta" rows="1" cols="20" style="float:right; resize:none;">PT10S</textarea>' +
            '</span>' +
        '</div>';

        this.$el.find("#custom_subsetting_cb").off();
        this.$el.find("#custom_subsetting").empty();
        this.$el.find("#custom_subsetting").append(subsetting_cb);

        $("#custom_subsetting_cb").click(function (evt) {
          if ($('#custom_subsetting_cb').is(':checked')) {
            $("#custom_subsetting").append(subsettingFilter);
          } else {
            $("#custom_subsetting_filter").remove();
          }
        });

        this.$el.find("#custom_time_cb").off();
        this.$el.find("#custom_time").empty();
        /*this.$el.find("#custom_time").html(
            '<div class="checkbox" style="margin-left:0px;"><label><input type="checkbox" value="" id="custom_time_cb">Custom time selection</label></div><div id="customtimefilter"></div>'
        );*/

        this.$el.find('#custom_time_cb').click(_.bind(function () {
          $('#customtimefilter').empty();
          if ($('#custom_time_cb').is(':checked')) {
            var timeinterval = this.model.get("ToI");
            var extent = [
              getISOTimeString(timeinterval.start),
              getISOTimeString(timeinterval.end)
            ];
            var name = "Time (hh:mm:ss.fff)";
            var $html = $(FilterTmpl({
              id: "timefilter",
              name: name,
              extent: extent
            })
            );
            $('#customtimefilter').append($html);
            $('#customtimefilter .input-group-btn button').removeClass();
            $('#customtimefilter .input-group-btn button').attr('class', 'btn disabled');
          }
        }, this));

        // Make sure the available essential parameters are selected.
        var selected = _.map(ESSENTIAL_PARAMETERS, function (variable) {
          if (_.any(available_parameters, function (item) {return item.id == variable;})) {
            return {id: variable};
          }
        });

        // See if magnetic data actually selected if not remove residuals
        var magdata = _.any(_.keys(products), function (key) {return key.includes("MAG");});

        if (!magdata) {
          available_parameters = _.filter(available_parameters, function (v) {
            return !v.id.includes("_res_");
          });
        }

        $('#param_enum').w2field('enum', {
          items: _.sortBy(available_parameters, 'id'), // Sort parameters alphabetically
          openOnFocus: true,
          selected: selected,
          renderItem: _.bind(function (item, index, remove) {
            if (ESSENTIAL_PARAMETERS.includes(item.id)) {
              remove = "";
            }
            var html = remove + this.createSubscript(item.id);
            return html;
          }, this),
          renderDrop: _.bind(function (item, options) {
            $("#w2ui-overlay").addClass("downloadsection");

            var html = '<b>' + this.createSubscript(item.id) + '</b>';
            if (item.uom != null) {
              html += ' [' + item.uom + ']';
            }
            if (item.description) {
              html += ': ' + item.description;
            }
            //'<i class="fa fa-info-circle" aria-hidden="true" data-placement="right" style="margin-left:4px;" title="'+item.description+'"></i>';

            return html;
          }, this),
          onRemove: function (evt) {
            if (ESSENTIAL_PARAMETERS.includes(evt.item.id)) {
              evt.preventDefault();
              evt.stopPropagation();
            }
          }
        });
        $('#param_enum').prop('disabled', true);
        $('#param_enum').w2field().refresh();

        this.$el.find("#custom_parameter_cb").click(function (evt) {
          if ($('#custom_parameter_cb').is(':checked')) {
            $('#param_enum').prop('disabled', false);
            $('#param_enum').w2field().refresh();
          } else {
            $('#param_enum').prop('disabled', true);
            $('#param_enum').w2field().refresh();
          }
        });

      },

      updateJobs: function () {

        var url_jobs = '/ows?service=wps&request=execute&version=1.0.0&identifier=listJobs&RawDataOutput=job_list';

        $.get(url_jobs, 'json')
          .done(function (processes) {
            $('#download_processes').empty();

            if (has(processes, 'vires:fetch_filtered_data_async')) {

              var processes_to_save = 2;
              processes = processes['vires:fetch_filtered_data_async'];

              // Button will be enabled/disabled depending if there are active jobs
              var has_active_process = _.any(processes, function (process) {
                return isActive(process.status);
              });

              if (has_active_process) {
                disableDownloadButton();
              } else {
                enableDownloadButton();
              }

              var removed_processes = processes.splice(0, processes.length - processes_to_save);
              _.each(removed_processes, function (process) {
                $.get('/ows?service=WPS&request=Execute&identifier=removeJob&DataInputs=job_id=' + process.id);
              });

              if (processes.length > 0) {
                $('#download_processes').append('<div><b>Download links</b> (Process runs in background, panel can be closed and reopened at any time)</div>');
                $('#download_processes').append('<div style="float: left; margin-left:20px;"><b>Process started</b></div>');
                $('#download_processes').append('<div style="float: left; margin-left:100px;"><b>Status</b></div>');
                $('#download_processes').append('<div style="float: left; margin-left:240px;"><b>Info</b></div>');
                $('#download_processes').append('<div style="float: left; margin-left:110px;"><b>Link</b></div>');
              }

              _.each(processes.reverse(), function (process) {
                var model = new DownloadProcessModel({
                  id: process.id,
                  creation_time: getISODateTimeString(new Date(Date.parse(process.created)), true),
                  status_url: process.url,
                  status: process.status
                });

                var element = $('<div></div>');
                $('#download_processes').append(element);

                var view = new DownloadProcessView({
                  el: element,
                  model: model,
                });

                view.render();
                model.fetch();
              });
            } else {
              // If there are no processes activate button
              enableDownloadButton();
            }
          });
      },

      renderFilterList: function () {
        var fil_div = this.$el.find("#filters");
        fil_div.find('.w2ui-field').remove();
        $('#downloadAddFilter').remove();

        var available_uom = _.clone(globals.swarm.get('uom_set') || {});

        _.each(_.keys(this.currentFilters), function (key) {

          // Check if filter part of parameters of currently selected products
          if (!has(available_uom, key)) {
            delete this.currentFilters[key];

          } else if ($('#filters #' + key).length == 0) {
            var extent = this.currentFilters[key].map(this.round);
            var name = "";
            var parts = key.split("_");
            if (parts.length > 1) {
              name = parts[0];
              for (var i = 1; i < parts.length; i++) {
                name += (" " + parts[i]).sub();
              }
            } else {
              name = key;
            }

            var $html = $(FilterTmpl({
              id: key,
              name: name,
              extent: extent,
              index1: this.tabindex++,
              index2: this.tabindex++,
              index3: this.tabindex++
            }));

            fil_div.append($html);
          }
        }, this);

        // Create possible filter options based on possible download parameters
        var filteroptions = _.clone(EXTRA_PARAMETERS);

        globals.products.each(function (model) {
          if (model.get('visible')) {
            _.extend(filteroptions, model.get('download_parameters'));
          }
        });

        // Decompose vectors to their scalar components.
        _.each(_.keys(filteroptions), function (variable) {
          var components = get(VECTOR_BREAKDOWN, variable);
          if (!components) {return;}
          var options = pop(filteroptions, variable);
          for (var i = 0; i < components.length; i++) {
            filteroptions[components[i]] = {
              uom: options.uom,
              name: 'Component of ' + options.name
            };
          }
        });

        // Remove currently filtered and other unwanted variables.
        var _removeVariable = function (variable) {
          pop(filteroptions, variable);
        };
        _.each(_.keys(this.currentFilters), _removeVariable);
        _.each(EXCLUDED_PARAMETERS, _removeVariable);

        $('#filters').append(
          '<div class="w2ui-field"> <button id="downloadAddFilter" type="button" class="btn btn-default dropdown-toggle">Add filter <span class="caret"></span></button> <input type="list" id="addfilter"></div>'
        );

        $("#downloadAddFilter").click(function () {
          $('.w2ui-field-helper input').css('text-indent', '0em');
          $("#addfilter").focus();
        });

        $('#addfilter').w2field('list', {
          items: _.keys(filteroptions).sort(),
          renderDrop: _.bind(function (item, options) {
            var html = '<b>' + this.createSubscript(item.id) + '</b>';
            if (filteroptions[item.id].uom != null) {
              html += ' [' + filteroptions[item.id].uom + ']';
            }
            if (filteroptions[item.id].name != null) {
              html += ': ' + filteroptions[item.id].name;
            }
            return html;
          }, this)
        });

        $('#addfilter').change(this.handleItemSelected.bind(this));

        // Remove previously set click bindings
        this.$('.delete-filter').off('click');
        this.$('.delete-filter').on('click', _.bind(function (evt) {
          var item = evt.currentTarget.parentElement.parentElement;
          item.parentElement.removeChild(item);
          delete this.currentFilters[item.id];
          this.renderFilterList();
        }, this));

        $('.w2ui-field-helper input').attr('placeholder', 'Type to search');

      },

      round: function (val) {
        return val.toFixed(2);
      },

      fieldsValid: function () {
        var filter_elem = this.$el.find(".input-group");

        var valid = true;

        _.each(filter_elem, function (fe) {
          var extent_elem = $(fe).find("textarea");

          for (var i = extent_elem.length - 1; i >= 0; i--) {

            if (extent_elem.context.id == 'timefilter') {
              if (!isValidTime(extent_elem[i].value)) {
                $(extent_elem[i]).css('background-color', 'rgb(255, 215, 215)');
                valid = false;
              } else {
                $(extent_elem[i]).css('background-color', 'transparent');
              }
            } else if (extent_elem.context.id == 'custom_subsetting_filter') {
              if ((extent_elem[i].value)[0] !== 'P') {
                $(extent_elem[i]).css('background-color', 'rgb(255, 215, 215)');
                valid = false;
              } else {
                $(extent_elem[i]).css('background-color', 'transparent');
              }
            } else {
              if (!$.isNumeric(extent_elem[i].value)) {
                $(extent_elem[i]).css('background-color', 'rgb(255, 215, 215)');
                valid = false;
              } else {
                $(extent_elem[i]).css('background-color', 'transparent');
              }
            }

          }
        });
        return valid;

      },

      onStartDownloadClicked: function () {
        $('#validationwarning').remove();
        // First validate fields
        if (!this.fieldsValid()) {
          // Show 'there is an issue in the fields' and return
          $('.panel-footer').append('<div id="validationwarning">There is an issue with the provided filters, please look for the red marked fields.</div>');
          return;
        }

        //var $downloads = $("#div-downloads");
        var options = {};

        // format
        options.format = this.$("#select-output-format").val();

        if (options.format == "application/cdf") {
          options['time_format'] = "Unix epoch";
        }

        // time
        var copyUTCDate = function (date) {
          return new Date(Date.UTC(
            date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(),
            date.getMinutes(), date.getSeconds()
          ));
        };

        options.begin_time = copyUTCDate(this.start_picker.datepicker("getDate"));
        options.begin_time.setUTCHours(0, 0, 0, 0);

        options.end_time = copyUTCDate(this.end_picker.datepicker("getDate"));
        options.end_time.setUTCHours(23, 59, 59, 999);

        // Add time subsetting option
        if ($('#custom_subsetting_filter').length != 0) {
          options.sampling_step = $('#custom_subsetting_ta').val();
        }

        // Rewrite time for start and end date if custom time is active
        if ($("#timefilter").length != 0) {
          var s = parseTime($($("#timefilter").find('textarea')[1]).val());
          var e = parseTime($($("#timefilter").find('textarea')[0]).val());
          options.begin_time.setUTCHours(s[0], s[1], s[2], s[3]);
          options.end_time.setUTCHours(e[0], e[1], e[2], e[3]);
        }

        var bt_obj = options.begin_time;
        var et_obj = options.end_time;
        options.begin_time = getISODateTimeString(options.begin_time);
        options.end_time = getISODateTimeString(options.end_time);

        // products
        //options.collection_ids = this.swarm_prod.map(function(m){return m.get("views")[0].id;}).join(",");
        var retrieve_data = [];

        globals.products.each(function (model) {
          if (_.find(this.swarm_prod, function (p) {return model.get("views")[0].id == p.get("views")[0].id;})) {
            var processes = model.get("processes");
            _.each(processes, function (process) {
              if (process) {
                switch (process.id) {
                  case "retrieve_data":
                    retrieve_data.push({
                      layer: process.layer_id,
                      url: model.get("views")[0].urls[0]
                    });
                    break;
                }
              }
            }, this);
          }
        }, this);

        if (retrieve_data.length > 0) {
          options["collections_ids"] = DataUtil.formatCollections(
            DataUtil.parseCollections(retrieve_data)
          );
        }

        // models
        options["model_ids"] = _.map(this.models, function (item) {
          return item.getModelExpression(item.get('download').id);
        }).join(',');

        options["shc"] = _.map(this.models, function (item) {
          return item.getCustomShcIfSelected();
        })[0] || null;

        // filters
        var filters = [];
        var filter_elem = $('#filters').find(".input-group");

        _.each(filter_elem, function (fe) {

          var extent_elem = $(fe).find("textarea");
          if (extent_elem.context.id == 'timefilter') {
            return;
          }
          var extent = [];
          for (var i = extent_elem.length - 1; i >= 0; i--) {
            extent[i] = parseFloat(extent_elem[i].value);
          }
          // Make sure smaller value is first item
          extent.sort(function (a, b) {return a - b;});

          // Check to see if filter is on a vector component
          var variable = fe.id;
          _.any(VECTOR_BREAKDOWN, function (components, vectorVariable) {
            var index = _.indexOf(components, fe.id);
            if (index === -1) {return false;}
            variable = vectorVariable + '[' + index + ']';
            return true;
          });

          filters.push(variable + ':' + extent.join(","));
        });

        options.filters = filters.join(";");

        // Custom variables
        var variables;
        if ($('#custom_parameter_cb').is(':checked')) {
          variables = $('#param_enum').data('selected');
          variables = variables.map(function (item) {return item.id;});
          variables = variables.join(',');
          options.variables = variables;
        } else {
          // Use default parameters as described by download
          // product parameters in configuration
          var strippedVariables = [
            "QDLat", "QDLon", "MLT", "OrbitDirection", "QDOrbitDirection",
            "OrbitNumber", "SunDeclination", "SunRightAscension",
            "SunHourAngle", "SunAzimuthAngle", "SunZenithAngle",
            "B_NEC_resAC"
          ];

          // Separate models and Swarm products and add lists to ui
          options.variables = _.chain(this.model.get("products"))
            .map(function (product) {
              var parameters = product.get("download_parameters");
              return parameters && !product.get("model") ? _.keys(parameters) : [];
            })
            .flatten()
            .uniq()
            .difference(strippedVariables)
            .value();
        }

        // TODO: Just getting last URL here think of how different urls should be handled
        var url = this.swarm_prod.map(function (m) {return m.get("views")[0].urls[0];})[0];
        var req_data = wps_fetchFilteredDataAsync(options);

        // Do some sanity checks before starting process

        // Calculate the difference in milliseconds
        var difference_ms = et_obj.getTime() - bt_obj.getTime();
        var days = Math.round(difference_ms / (1000 * 60 * 60 * 24));

        var that = this;
        var sendProcessingRequest = function () {
          disableDownloadButton();
          $.post(url, req_data, 'xml')
            .done(function (response) {
              that.updateJobs();
            })
            .error(function (resp) {
              enableDownloadButton();
            });
        };

        if (days > 50 && filters.length == 0) {
          w2confirm('The current selection will most likely exceed the download limit, please make sure to add filters to further subset your selection. <br> Would you still like to proceed?')
            .yes(function () {
              sendProcessingRequest();
            });

        } else if (days > 50) {
          w2confirm('The current selected time interval is large and could result in a large download file if filters are not restrictive. The process runs in the background and the browser does not need to be open.<br>Are you sure you want to proceed?')
            .yes(function () {
              sendProcessingRequest();
            });
        } else {
          sendProcessingRequest();
        }

      },

      onClose: function () {
        Communicator.mediator.trigger("ui:close", "download");
        this.close();
      }
    });

    return {DownloadFilterView: DownloadFilterView};
  });
}).call(this);
