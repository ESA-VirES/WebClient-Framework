/*global $ _ w2confirm BitwiseInt */
/*global getISODateTimeString */
/*global VECTOR_BREAKDOWN REVERSE_VECTOR_BREAKDOWN TIMESTAMP */
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
    'hbs!tmpl/RangeFilterTemplate',
    'hbs!tmpl/DownloadProcess',
    'hbs!tmpl/wps_fetchFilteredDataAsync',
    'views/DownloadFilters',
    'dataUtil',
    'viresFilters',
    'underscore',
    'w2ui',
    'w2popup',
    'd3',
    'graphly'
  ],
  function (
    Backbone, Communicator, globals, m, DownloadFilterTmpl, RangeFilterTmpl,
    DownloadProcessTmpl, wps_fetchFilteredDataAsync,
    DownloadFilters, DataUtil, viresFilters
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


    var createSubscript = function createSubscript(string) {
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
            note: "(incl.)",
          };
        },
        end_time: function (input) {
          return {
            label: 'End time',
            body: input.data,
            note: "(excl.)",
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
        this.parameters = [];
        this.products = [];
        this.models = [];
        this.loadcounter = 0;
        this.currentFilters = {};
        this.filterViews = {};
        this.samplingFilterView = null;
        this.timeSelectionView = null;
        this.dateSelectionView = null;
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

        _.extend(this.currentFilters, (function () {
          var filters = this.model.get("filter");

          if (typeof filters === 'undefined') {
            filters = {};
          }

          var aoi = this.model.get("AoI");
          if (aoi) {
            filters["Longitude"] = viresFilters.createRangeFilter(aoi.w, aoi.e);
            filters["Latitude"] = viresFilters.createRangeFilter(aoi.s, aoi.n);
          }

          // omit zero Bitmask filters
          _.each(filters, function (filter, key) {
            if (filter.type === "BitmaskFilter" && filter.mask === 0) {
              delete filters[key];
            }
          });

          return filters;
        }).call(this));

        this.renderFilterList();

        // Date and optional time selection

        var timeInterval = this.model.get("ToI");

        this.showDateSelection(timeInterval);

        this.removeTimeSelection();

        var $timeSelectionCheckbox = this.$el.find("#time_input_cb");
        $timeSelectionCheckbox.off();
        $timeSelectionCheckbox.click(_.bind(function () {
          this.removeTimeSelection();
          if ($timeSelectionCheckbox.is(':checked')) {
            this.showTimeSelection(timeInterval);
          }
        }, this));

        // Optional custom time sampling filter

        var $samplingInputCheckbox = this.$el.find("#sampling_input_cb");
        $samplingInputCheckbox.off();
        $samplingInputCheckbox.click(_.bind(function () {
          this.removeSamplingFilter();
          if ($samplingInputCheckbox.is(':checked')) {
            this.showSamplingFilter({seconds: 10});
          }
        }, this));

        // Update the lists of products, models and available parameters

        this.collectProductsModelsAndParameters();

        this.renderProductAndModelLists();

        // Custom parameters

        var $customParametersCheckbox = this.$el.find("#custom_parameters_cb");
        $customParametersCheckbox.off();
        $customParametersCheckbox.click(_.bind(function () {
          if ($customParametersCheckbox.is(':checked')) {
            this.enableParametersList();
          } else {
            this.disableParametersList();
          }
        }, this));
        this.initParametersList(
          this.getAvailableParameters(this.parameters),
          this.getSelectedParameters(this.parameters)
        );
        this.disableParametersList();
      },

      onStartDownloadClicked: function () {

        var _renderErrorMessage = function (message) {
          $('.panel-footer').append('<div id="validationwarning">' + message + '</div>');
        };

        $('#validationwarning').remove();

        // check if any downloadable products are selected
        if (this.products.length == 0) {
          _renderErrorMessage("Cannot proceed with the download. No downloadable product is selected.");
          return;
        }

        // validate input fields
        if (!this.validateInputs()) {
          _renderErrorMessage("There is an issue with the provided filters, please look for the red marked fields.");
          return;
        }

        //var $downloads = $("#div-downloads");
        var options = {};

        // format
        options.format = this.$("#select-output-format").val();

        if (options.format == "application/cdf") {
          options['time_format'] = "Unix epoch";
        }

        var beginTime = this.dateSelectionView.model.dataType.toUTCDate(
          this.dateSelectionView.model.get("lowerBound")
        );
        var endTime = this.dateSelectionView.model.dataType.toUTCDate(
          this.dateSelectionView.model.get("upperBound")
        );

        if (this.timeSelectionView) {
          // Precise time selection is active
          this.timeSelectionView.model.dataType.setUTCHoursFromMilliseconds(
            beginTime, this.timeSelectionView.model.get("lowerBound")
          );
          this.timeSelectionView.model.dataType.setUTCHoursFromMilliseconds(
            endTime, this.timeSelectionView.model.get("upperBound")
          );
        } else {
          // Precise time selection is not active:
          // - round start date down to the start of the day ...
          beginTime.setUTCHours(0, 0, 0, 0);
          // - round end date up to the start of the next whole day/
          endTime.setDate(endTime.getDate() + 1);
          endTime.setUTCHours(0, 0, 0, 0);
        }

        options.begin_time = getISODateTimeString(beginTime);
        options.end_time = getISODateTimeString(endTime);

        var requestDaysDuration = (
          endTime.getTime() - beginTime.getTime()
        ) / 86400000;

        if (this.samplingFilterView) {
          options.sampling_step = this.samplingFilterView.model.dataType.formatValue(
            this.samplingFilterView.model.get("value")
          );
        }

        // products
        var retrieve_data = [];

        globals.products.each(function (model) {
          if (_.find(this.products, function (p) {return model.get("views")[0].id == p.get("views")[0].id;})) {
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

        var getSourceVariableName = function (name) {
          var v = get(REVERSE_VECTOR_BREAKDOWN, name);
          return v ? (v.source + "[" + v.index + "]") : name;
        };

        // filters
        var filters = _.map(this.filterViews, function (view, key) {
          return viresFilters.formatFilter(
            getSourceVariableName(view.model.get("id")), view.model.toFilter()
          );
        });

        options.filters = viresFilters.joinFormattedFilters(filters);

        // Custom variables
        var $customParametersCheckbox = this.$el.find("#custom_parameters_cb");
        if ($customParametersCheckbox.is(':checked')) {
          options.variables = (
            this.readSelectedParameters()
              .map(function (item) {return item.id;})
              .join(",")
          );
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
        var url = this.products.map(function (item) {return item.get("views")[0].urls[0];})[0];
        var req_data = wps_fetchFilteredDataAsync(options);

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

        // Warn users about possibly large data requests.

        var MAX_REQUST_DAYS_DURATION = 50;

        var message;
        if (requestDaysDuration >= MAX_REQUST_DAYS_DURATION) {
          if (filters.length == 0) {
            message = [
              "The current selection will most likely exceed the download limit,",
              "please make sure to add filters to further subset your selection.",
              "<br> Would you still like to proceed?",
            ].join(" ");
          } else {
            message = [
              "The current selected time interval is large and could result in",
              " a large download file if filters are not restrictive. ",
              "The process runs in the background and the browser does not ",
              "need to be open.",
              "<br>Are you sure you want to proceed?",
            ].join(" ");
          }
          w2confirm(message).yes(sendProcessingRequest);
        } else {
          sendProcessingRequest();
        }

      },

      onClose: function () {
        Communicator.mediator.trigger("ui:close", "download");
        for (var key in this.filterViews) {
          pop(this.filterViews, key).remove();
        }
        this.removeSamplingFilter();
        this.removeTimeSelection();
        this.removeDateSelection();
        this.close();
      },

      validateInputs: function () {

        var isValid = true;

        _.each(this.filterViews, function (view, key) {
          isValid = isValid && view.model.isValid();
        });

        if (this.dateSelectionView) {
          isValid = isValid && this.dateSelectionView.model.isValid();
        }

        if (this.timeSelectionView) {
          isValid = isValid && this.timeSelectionView.model.isValid();
        }

        if (this.samplingFilterView) {
          isValid = isValid && this.samplingFilterView.model.isValid();
        }

        return isValid;
      },

      getSelectedParameters: function (availableParameters) {
        // Make sure the available essential parameters are selected.
        return _.map(ESSENTIAL_PARAMETERS, function (variable) {
          if (_.any(availableParameters, function (item) {return item.id == variable;})) {
            return {id: variable};
          }
        });

      },

      getAvailableParameters: function (availableParameters) {

        // See if magnetic data actually selected if not remove residuals
        var magneticDataSelected = _.any(
          _.keys(this.model.get("products")),
          function (key) {return key.includes("MAG");}
        );

        if (!magneticDataSelected) {
          availableParameters = _.filter(
            availableParameters,
            function (item) {return !item.id.includes("_res_");}
          );
        }

        return availableParameters;
      },

      collectProductsModelsAndParameters: function () {
        // return list of available parameters
        var parameters = [];
        var products = [];
        var models = [];

        // Separate models and Swarm products and add lists to ui
        _.each(this.model.get("products"), function (prod) {

          if (prod.get("download_parameters")) {
            var par = prod.get("download_parameters");
            var new_keys = _.keys(par);
            _.each(new_keys, function (key) {
              if (!_.find(parameters, function (item) {
                return item.id == key;
              })) {
                parameters.push({
                  id: key,
                  uom: par[key].uom,
                  description: par[key].name,
                });
              }
            });
          }

          if (prod.get("processes")) {
            var result = _.find(prod.get("processes"), function (item) {return item.id == "retrieve_data";});
            if (result && !get(result, "doNotLoadAsPrimary", false)) {
              products.push(prod);
            }
          }

          if (prod.get("model")) {
            models.push(prod);
          }
        });

        this.parameters = parameters;
        this.products = products;
        this.models = models;
      },

      renderProductAndModelLists: function () {
        var _renderList = function ($container, title, items) {
          $container.append('<div style="font-weight:bold;">' + title + '</div>');
          $container.append('<ul style="padding-left:15px">');
          var $list = $container.find("ul");
          _.each(items, function (item) {
            $list.append('<li style="list-style-type: circle; padding-left:-6px;list-style-position: initial;">' + item + '</li>');
          });
        };

        var _renderWarningMessage = function ($container, message) {
          $container.append('<div style="font-weight:bold;padding-left:15px" class="warning">' + message + '</div>');
        };

        if (this.products.length > 0) {
          _renderList(
            this.$el.find("#productsList"), "Products",
            this.products.map(function (item) {return item.get("name");})
          );

        } else {
          _renderWarningMessage(
            this.$el.find("#productsList"),
            "No downloadable product selected."
          );
          return;
        }

        if (this.models.length > 0) {
          _renderList(
            this.$el.find("#modelsList"), "Models",
            this.models.map(function (item) {return item.getPrettyModelExpression();})
          );
        }
      },

      initParametersList: function (availableParameters, selectedParameters) {
        var $parametersList = $('#parameters_list');
        $parametersList.w2field('enum', {
          items: _.sortBy(availableParameters, 'id'), // Sort parameters alphabetically
          openOnFocus: true,
          selected: selectedParameters || [],
          renderItem: function (item, index, remove) {
            if (ESSENTIAL_PARAMETERS.includes(item.id)) {
              remove = "";
            }
            var html = remove + createSubscript(item.id);
            return html;
          },
          renderDrop: function (item, options) {
            $("#w2ui-overlay").addClass("downloadsection");
            var html = '<b>' + createSubscript(item.id) + '</b>';
            if (item.uom != null) {
              html += ' [' + item.uom + ']';
            }
            if (item.description) {
              html += ': ' + item.description;
            }
            return html;
          },
          onRemove: function (event_) {
            if (ESSENTIAL_PARAMETERS.includes(event_.item.id)) {
              event_.preventDefault();
              event_.stopPropagation();
            }
          }
        });

      },

      readSelectedParameters: function () {
        return $('#parameters_list').data('selected');
      },

      disableParametersList: function () {
        var $parametersList = $('#parameters_list');
        $parametersList.prop('disabled', true);
        $parametersList.w2field().refresh();
      },

      enableParametersList: function () {
        var $parametersList = $('#parameters_list');
        $parametersList.prop('disabled', false);
        $parametersList.w2field().refresh();
      },

      removeTimeSelection: function () {
        if (this.timeSelectionView) {
          this.timeSelectionView.remove();
          this.timeSelectionView = null;
        }
        this.$el.find("#time_filter").empty();
      },

      showTimeSelection: function (timeInterval) {
        var view;
        if (this.timeSelectionView) {return;}
        this.timeSelectionView = view = new DownloadFilters.TimeRangeFilterView({
          id: "time",
          label: "Time (hh:mm:ss.sss)",
          filter: {
            lowerBound: timeInterval.start.getTime() % 86400000,
            upperBound: timeInterval.end.getTime() % 86400000,
          },
          parameters: {},
          removable: false,
        });
        view.render();
        this.$el.find("#time_filter").append(view.$el);
      },

      removeDateSelection: function () {
        if (this.dateSelectionView) {
          this.dateSelectionView.remove();
          this.dateSelectionView = null;
        }
        this.$el.find("#date_filter").empty();
      },

      showDateSelection: function (timeInterval) {
        if (this.dateSelectionView) {return;}

        var view = this.dateSelectionView = new DownloadFilters.DateRangeFilterView({
          id: "date",
          label: "Date (YYYY-MM-DD)",
          filter: {
            lowerBound: DownloadFilters.DateType.fromUTCDate(timeInterval.start),
            upperBound: DownloadFilters.DateType.fromUTCDate(timeInterval.end),
          },
          parameters: {},
          removable: false,
        });
        view.render();
        this.$el.find("#date_filter").append(view.$el);
      },

      removeSamplingFilter: function () {
        if (this.samplingFilterView) {
          this.samplingFilterView.remove();
          this.samplingFilterView = null;
        }
        this.$el.find("#time_sampling_filter").empty();
      },

      showSamplingFilter: function (value) {
        if (this.samplingFilterView) {return;}

        var view = this.samplingFilterView = new DownloadFilters.DurationFilterView({
          id: "timeSampling",
          label: "Time sampling (ISO-8601 duration, e.g., PT1H10M30.5S)",
          filter: {
            value: value,
          },
          parameters: {},
          removable: false,
        });
        view.render();
        this.$el.find("#time_sampling_filter").append(view.$el);
      },

      updateJobs: function () {

        var url_jobs = (
          globals.download.get('url') +
          '?service=wps&request=execute&version=1.0.0&identifier=listJobs&RawDataOutput=job_list'
        );

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

        var availableParameters = globals.swarm.get('uom_set') || {};

        var filterViewClass = {
          "RangeFilter": DownloadFilters.RangeFilterView,
          "BitmaskFilter": DownloadFilters.BitmaskFilterView
        };

        _.each(this.currentFilters, function (filter, name) {

          if (!has(availableParameters, name)) {
            delete this.currentFilters[name];
            return;
          }

          if (has(this.filterViews, name)) {
            // filter already rendered
            return;
          }

          var view = new filterViewClass[filter.type]({
            id: name,
            filter: filter,
            parameters: availableParameters[name],
          });

          view.render();
          fil_div.append(view.$el);
          this.filterViews[name] = view;
        }, this);


        // Create possible filter options based on possible download parameters
        var filterOptions = _.clone(EXTRA_PARAMETERS);

        globals.products.each(function (model) {
          if (model.get('visible')) {
            _.each(model.get('download_parameters'), function (item, key) {
              var sources = _.pick(availableParameters, get(VECTOR_BREAKDOWN, key) || [key]);
              _.each(sources, function (item, key) {
                filterOptions[key] = {uom: item.uom, name: item.name};
              });
              _.each(get(VECTOR_BREAKDOWN, key) || [], function (key) {
                filterOptions[key].name = 'Component of ' + filterOptions[key].name;
              });
            });
          }
        });

        // Remove currently filtered and other unwanted variables.
        filterOptions = _.omit(filterOptions, _.keys(this.currentFilters));
        filterOptions = _.omit(filterOptions, EXCLUDED_PARAMETERS);

        $('#filters').append(
          '<div class="w2ui-field"> <button id="downloadAddFilter" type="button" class="btn btn-default dropdown-toggle">Add filter <span class="caret"></span></button> <input type="list" id="addfilter"></div>'
        );

        $("#downloadAddFilter").click(function () {
          $('.w2ui-field-helper input').css('text-indent', '0em');
          $("#addfilter").focus();
        });

        $('#addfilter').w2field('list', {
          items: _.keys(filterOptions).sort(),
          renderDrop: _.bind(function (item, options) {
            var html = '<b>' + createSubscript(item.id) + '</b>';
            if (filterOptions[item.id].uom != null) {
              html += ' [' + filterOptions[item.id].uom + ']';
            }
            if (filterOptions[item.id].name != null) {
              html += ': ' + filterOptions[item.id].name;
            }
            return html;
          }, this)
        });

        $('#addfilter').change(_.bind(
          function (event_) {this.addFilter($('#addfilter').val());}, this
        ));

        // Remove previously set click bindings
        this.$('.delete-filter').off('click');
        this.$('.delete-filter').on('click', _.bind(function (event_) {
          this.removeFilter(event_.currentTarget.parentElement.parentElement.id);
        }, this));

        $('.w2ui-field-helper input').attr('placeholder', 'Type to search');

      },

      addFilter: function (name) {
        var parameters = get(globals.swarm.get('uom_set') || {}, name);
        if (!parameters) {return;}
        var filters = this.model.get("filter") || {};
        if (has(filters, name)) {
          this.currentFilters[name] = filters[name];
        } else if (has(parameters, "bitmask")) {
          this.currentFilters[name] = viresFilters.createBitmaskFilter(
            parameters.bitmask.flags.length, 0, 0
          );
        } else {
          this.currentFilters[name] = viresFilters.createRangeFilter(0.0, 0.0);
        }
        this.renderFilterList();
      },

      removeFilter: function (name) {
        pop(this.filterViews, name).remove();
        delete this.currentFilters[name];
        this.renderFilterList();
      },

    });

    return {DownloadFilterView: DownloadFilterView};
  });
}).call(this);
