/*global $ _ */
/*global showMessage getISODateTimeString RELATED_COLLECTIONS RELATED_VARIABLES */
/*global MODEL_VARIABLES */
/*global has get pop setDefault Timer */

(function () {
  'use strict';

  var root = this;

  root.require([
    'backbone',
    'communicator',
    'globals',
    'viresDataRequest',
    'app',
    'dataUtil',
    'underscore'
  ],

  function (Backbone, Communicator, globals, vires, App, DataUtil) {

    var DataController = Backbone.Marionette.Controller.extend({

      initialize: function (options) {

        this.selection_list = [];
        this.activeWPSproducts = [];
        this.activeModels = [];
        this.selected_time = null;

        this.listenTo(Communicator.mediator, "map:layer:change", this.changeLayer);
        this.listenTo(Communicator.mediator, "map:multilayer:change", this.multiChangeLayer);
        this.listenTo(Communicator.mediator, "selection:changed", this.onSelectionChanged);
        this.listenTo(Communicator.mediator, 'time:change', this.onTimeChange);
        this.listenTo(Communicator.mediator, 'manual:init', this.onManualInit);
        this.listenTo(Communicator.mediator, "model:change", this.onModelChange);
        this.listenTo(Communicator.mediator, "analytics:set:filter", this.onAnalyticsFilterChanged);

        this.request = new vires.ViresDataRequest({
          context: this,
          opened: this.onRequestStart,
          completed: this.onRequestEnd,
          aborted: this.onRequestAborted,
          success: this.onDataReceived,
          error: this.onRequestError,
        });

        this.relatedRequests = [];

      },

      getAvailableModelProducts: function () {
        var modelProducts = {};
        globals.products.each(function (product) {
          if (product.get('model')) {
            modelProducts[product.get('download').id] = product;
          }
        });
        return modelProducts;
      },

      onManualInit: function () {
        // TODO: Check to see if already active products are configured
        for (var i = 0; i < globals.products.models.length; i++) {
          if (globals.products.models[i].get('model') && globals.products.models[i].get('visible')) {
            this.activeModels.push(globals.products.models[i].get("download").id);
          }
        }
      },

      checkModelValidity: function () {
        // Added some checks here to see if model is outside validity
        $(".validitywarning").remove();
        var selected_time = this.selected_time;

        if (!selected_time) {return;}

        var modelProducts = this.getAvailableModelProducts();

        var invalidModels = _.filter(this.activeModels, function (id) {
          var validity = modelProducts[id].getModelValidity();
          if (!validity) return false;
          return (
            selected_time.start < validity.start ||
            selected_time.end > validity.end
          );
        });

        if (invalidModels.length == 0) {return;}

        function isoFormat(date) {
          return getISODateTimeString(date).slice(0, -5) + 'Z';
        }

        var invalidModelsString = _.map(invalidModels, function (item) {
          var validity = modelProducts[item].getModelValidity();
          var name = modelProducts[item].getPrettyModelExpression(false);
          if (validity.end > validity.start) {
            return (
              name + ' validity ' +
              isoFormat(validity.start) + ' - ' +
              isoFormat(validity.end) + '<br>'
            );
          } else {
            return name + ' composed model with no validity interval<br>';
          }
        }).join('');

        showMessage('warning', (
          'The current time selection is outside the validity of ' +
          'the following selected models:<br>' + invalidModelsString +
          'Tip: You can see the validity of the model in the time slider.'
        ), 30, 'validitywarning');
      },

      updateLayerResidualParameters: function () {
        // Manage additional residual parameter for Swarm layers
        globals.products.each(function (product) {
          if (['Swarm', 'Upload'].includes(product.get('satellite'))) {
            // Get Layer parameters
            var pars = product.get("parameters");

            // Find selected and remove all already added model residuals.
            var selected = null;
            var keys = _.keys(pars);
            for (var i = keys.length - 1; i >= 0; i--) {
              if (pars[keys[i]].residuals) {
                if (pars[keys[i]].selected) {
                  selected = keys[i];
                }
                delete pars[keys[i]];
              }
            }

            _.each(MODEL_VARIABLES, function (params, prefix) {
              if (!params.productTypes.includes(product.get('type'))) {return;}
              _.each(this.activeModels, function (activeModel) {
                params = _.clone(params);
                if (activeModel == selected) {
                  params.selected = true;
                }
                pars[prefix + activeModel] = params;
              });
            }, this);

            product.set({"parameters": pars});
          }
        }, this);
        // Make sure any possible opened settings are updated
        Communicator.mediator.trigger("layer:settings:changed");
      },


      changeLayer: function (options) {
        if (!options.isBaseLayer) {
          var product = globals.products.find(function (model) {return model.get('name') == options.name;});
          if (product) {
            if (options.visible) {
              if (product.get("model")) {
                this.activeModels.push(product.get("download").id);
                this.updateLayerResidualParameters();
                this.checkSelections();
              }
            } else {
              if (this.activeModels.indexOf(product.get("download").id) != -1) {
                this.activeModels.splice(this.activeModels.indexOf(product.get("download").id), 1);
                this.updateLayerResidualParameters();
                this.checkSelections();
              }
            }
          }
        }

        this.checkModelValidity();
      },


      multiChangeLayer: function (layers) {
        this.activeWPSproducts = [];
        for (var i = layers.length - 1; i >= 0; i--) {
          var product = globals.products.find(function (model) {return model.get('download').id == layers[i];});
          if (product) {
            if (product.get("processes")) {
              _.each(product.get("processes"), function (process) {
                this.activeWPSproducts.push(process.layer_id);
              }, this);
            }
          }
        }
        this.checkSelections();
        this.checkModelValidity();
      },

      onSelectionChanged: function (bbox) {

        if (bbox) {
          this.selection_list.push(bbox);
          this.checkSelections();
        } else {
          this.plotdata = [];
          this.selection_list = [];
          this.checkSelections();
        }

      },

      onAnalyticsFilterChanged: function (filters) {},

      checkSelections: function () {
        if (this.selected_time == null)
          this.selected_time = Communicator.reqres.request('get:time');

        if (this.activeWPSproducts.length > 0 && this.selected_time) {
          this.sendRequest();
        } else if (globals.swarm.satellites['Upload'] && globals.userData.hasValidUploads()) {
          this.sendRequest();
        } else {
          globals.swarm.set({data: vires.EMPTY_DATA});
          globals.swarm.get('relatedData').clear();
          //Communicator.mediator.trigger("map:clear:image");
          //$(".colorlegend").empty();
        }
      },

      onTimeChange: function (time) {
        this.selected_time = time;
        this.checkSelections();
        this.checkModelValidity();
      },

      onModelChange: function (name) {
        this.onTimeChange();
      },

      sendRequest: function () {

        var that = this;
        //var map_crs_reverse_axes = true;

        var retrieve_data = [];

        globals.products.each(function (model) {
          if (that.activeWPSproducts.indexOf(model.get("views")[0].id) != -1) {
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

        // handling user uploads
        var userDataVariables = {};
        var uploadedHasResiduals = false;
        if (globals.swarm.satellites['Upload'] && globals.userData.hasValidUploads()) {
          // workaround for different process and layer names (USER_DATA vs upload product view id)
          retrieve_data.push({
            layer: globals.userData.views[0].id,
            url: globals.userData.views[0].url,
          });

          // check if uploaded data has F or B_NEC, then do NOT remove residuals
          userDataVariables = globals.userData.getCommonFields();
          uploadedHasResiduals = (
            userDataVariables.hasOwnProperty('F') ||
            userDataVariables.hasOwnProperty('B_NEC')
          );
        }

        if (retrieve_data.length > 0) {

          var collections = DataUtil.parseCollections(retrieve_data);

          var options = {
            "collections_ids": DataUtil.formatCollections(collections),
            "begin_time": getISODateTimeString(this.selected_time.start),
            "end_time": getISODateTimeString(this.selected_time.end)
          };


          var variables = [
            "F", "F_error", "B_NEC_resAC", "B_VFM", "B_error", "B_NEC",
            "Flags_F", "Flags_B", "Ne", "Te", "Vs",
            "U_orbit", "Bubble_Probability", "Flags_Bubble", "Kp", "Dst", "dDst", "F107", "QDLat", "QDLon", "MLT",
            "Relative_STEC_RMS", "Relative_STEC", "Absolute_STEC", "Absolute_VTEC", "Elevation_Angle", "GPS_Position", "LEO_Position",
            "IRC", "IRC_Error", "FAC", "FAC_Error",
            "EEF", "RelErr", "OrbitNumber", "OrbitDirection", "QDOrbitDirection",
            "SunDeclination", "SunRightAscension", "SunHourAngle", "SunAzimuthAngle", "SunZenithAngle",
            "Background_Ne", "Foreground_Ne", "PCP_flag", "Grad_Ne_at_100km", "Grad_Ne_at_50km", "Grad_Ne_at_20km",
            "Grad_Ne_at_PCP_edge", "ROD", "RODI10s", "RODI20s", "delta_Ne10s", "delta_Ne20s", "delta_Ne40s",
            "Num_GPS_satellites", "mVTEC", "mROT", "mROTI10s", "mROTI20s", "IBI_flag",
            "Ionosphere_region_flag", "IPIR_index", "Ne_quality_flag", "TEC_STD",
            "B_NEC_Model", "B_NEC_res_Model", "F_Model", "F_res_Model",
            "J_NE", "J_QD", "J_CF_NE", "J_CF_SemiQD", "J_DF_NE", "J_DF_SemiQD", "J_R",
            "Boundary_Flag", "Pair_Indicator",
            "Tn_msis", "Ti_meas_drift", "Ti_model_drift", "Flag_ti_meas", "Flag_ti_model",
            "M_i_eff", "M_i_eff_err", "M_i_eff_Flags", "M_i_eff_tbt_model",
            "V_i", "V_i_err", "V_i_Flags", "V_i_raw", "N_i", "N_i_err", "N_i_Flags",
            "T_e", "Phi_sc",
            "Vixh", "Vixh_error", "Vixv", "Vixv_error", "Viy", "Viy_error",
            "Viz", "Viz_error", "VsatN", "VsatE", "VsatC", "Ehx", "Ehy", "Ehz",
            "Evx", "Evy", "Evz", "Bx", "By", "Bz", "Vicrx", "Vicry", "Vicrz",
            "Quality_flags", "Calibration_flags",
            // MIT TEC
            "Latitude_QD", "Longitude_QD", "MLT_QD", "L_value", "SZA", "TEC",
            "Depth", "DR", "Width", "dL", "PW_Gradient", "EW_Gradient", "Quality",
            // PPI FAC also overlaps with MIT TEC params
            "Sigma", "PPI",
          ];

          var collectionList = _.chain(collections)
            .values()
            .flatten()
            .value();

          // See if magnetic data actually selected if not remove residuals
          var magSelected = _.any(collectionList, function (collection) {
            return collection.indexOf("MAG") !== -1;
          });

          if (!magSelected && !uploadedHasResiduals) {
            variables = _.filter(variables, function (v) {
              return v.indexOf("_res_") === -1;
            });
          }

          // Remove parameters requiring full latitude, longitude, and radius
          // position if only EEF products are selected.
          // EEF data have no radius and therefore these auxiliary parameters
          // cannot be calculated.
          var noLocation = _.all(collectionList, function (collection) {
            return collection.indexOf("EEF") !== -1;
          });

          if (noLocation) {
            variables = _.difference(variables, ["QDLat", "QDLon", "MLT"]);
          }

          // Add extra variables from the user uploaded files.
          variables = _.union(variables, _.keys(userDataVariables));

          options.variables = variables.join(",");

          if (this.selection_list.length > 0) {
            var bbox = this.selection_list[0];
            options["bbox"] = [bbox.s, bbox.w, bbox.n, bbox.e].join(",");
          }

          var availableModelProducts = this.getAvailableModelProducts();
          var selectedModelProducts = _.chain(this.activeModels)
            .map(function (id) {return availableModelProducts[id];})
            .filter(function (item) {return item;})
            .value();

          options["model_ids"] = _.map(selectedModelProducts, function (item) {
            return item.getModelExpression(item.get('download').id);
          }).join(',');

          options["shc"] = _.map(
            selectedModelProducts,
            function (item) {return item.getCustomShcIfSelected();}
          )[0] || null;

          // stop all related data requests
          _.each(this.relatedRequests, function (request) {request.abort();});
          this.relatedRequests = [];

          globals.swarm.clearSources();

          this.request.url = retrieve_data[0].url;
          this.request.fetch(options);

          // collect related data collections
          var relatedCollections = {}; // to be downloaded
          var parentCollections = {}; // collection which triggered the download
          _.each(collections, function (collectionIds, label) {
            _.each(collectionIds, function (collectionId) {
              var related = get(RELATED_COLLECTIONS, collectionId) || [];
              _.each(related, function (related) {
                setDefault(parentCollections, related.type, {});
                parentCollections[related.type][label] = collectionId;
                setDefault(relatedCollections, related.type, {});
                relatedCollections[related.type][label] = related.collections;
              });
            });
          });

          var relatedDataModel = globals.swarm.get('relatedData');

          relatedDataModel.clear();

          this.relatedRequests = _.map(relatedCollections, function (collections, productType) {
            var request = new vires.ViresDataRequest({
              context: this,
              success: function (data) {
                // keep link to collections which triggered this download
                data.parentCollections = parentCollections[productType];
                relatedDataModel.set(productType, data);
                globals.swarm.appendSources(data.info.sources);
              },
              error: function (xhr, message) {
                if (xhr.responseText === "") {return;}
                this.showErrorMessage(message);
              },
            });

            request.url = retrieve_data[0].url;
            request.fetch({
              collections_ids: DataUtil.formatCollections(collections),
              variables: (get(RELATED_VARIABLES, productType) || []).join(','),
              begin_time: options.begin_time,
              end_time: options.end_time,
              mimeType: options.mimeType,
              bbox: options.bbox,
            });

            return request;

          }, this);
        }
      },

      onRequestStart: function () {
        Communicator.mediator.trigger("progress:change", true);
      },

      onRequestEnd: function () {
        Communicator.mediator.trigger("progress:change", false);
      },

      onRequestAborted: function () {
        // stop all related data requests
        _.each(this.relatedRequests, function (request) {request.abort();});
        this.relatedRequests = [];
        globals.swarm.clearSources();
        globals.swarm.get('relatedData').clear();
        this.onRequestEnd();
      },

      onDataReceived: function (data) {
        // This should only happen here if there has been
        // some issue with the saved filter configuration
        // Check if current brushes are valid for current data
        var availableVariables = _.keys(data.data);
        var filtersModified = false;
        var filters = globals.swarm.get('filters') || {};

        var removedFilters = _.difference(_.keys(filters), availableVariables);

        if (removedFilters.length > 0) {
          filters = _.omit(filters, removedFilters);
          localStorage.setItem('filterSelection', JSON.stringify(filters));
          globals.swarm.set('filters', filters);
          Communicator.mediator.trigger('analytics:set:filter', filters);
        }

        globals.swarm.appendSources(data.info.sources)
        globals.swarm.set({data: data});
      },

      onRequestError: function (xhr, message) {
        globals.swarm.set({data: vires.EMPTY_DATA});
        if (xhr.responseText === "") {return;}
        this.showErrorMessage(message);
      },

      showErrorMessage: function (message) {
        if (!message) {
          message = 'Please contact feedback@vires.services if issue persists.';
        }
        showMessage('danger', ('Problem retrieving data: ' + message), 35);
      },

    });

    return new DataController();
  });

}).call(this);
