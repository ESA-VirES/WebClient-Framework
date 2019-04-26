/*global $ _ msgpack */
/*global showMessage getISODateTimeString VECTOR_BREAKDOWN */

(function () {
  'use strict';

  var root = this;

  root.require([
    'backbone',
    'communicator',
    'globals',
    'hbs!tmpl/wps_getdata',
    'hbs!tmpl/wps_fetchData',
    'app',
    'httpRequest',
    'dataUtil',
    'msgpack',
    'graphly',
    'underscore'
  ],

  function (
    Backbone, Communicator, globals, wps_getdataTmpl, wps_fetchDataTmpl, App,
    httpRequest, DataUtil
  ) {

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
        this.xhr = null;
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

          if (product.get("satellite") == "Swarm") {

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

            for (var i = this.activeModels.length - 1; i >= 0; i--) {

              pars[this.activeModels[i]] = {
                "range": [-10, 40],
                "uom": "nT",
                "colorscale": "jet",
                "name": ("Residuals to " + this.activeModels[i]),
                "residuals": true
              };
              if (this.activeModels[i] == selected) {
                pars[this.activeModels[i]].selected = true;
              }

              product.set({"parameters": pars});
            }
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
        localStorage.setItem('swarmProductSelection', JSON.stringify(this.activeWPSproducts));
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

      onAnalyticsFilterChanged: function (filters) {
        //globals.swarm.set({filters: filters});
      },

      checkSelections: function () {
        if (this.selected_time == null)
          this.selected_time = Communicator.reqres.request('get:time');

        if (this.activeWPSproducts.length > 0 && this.selected_time) {
          this.sendRequest();
        } else {
          globals.swarm.set({data: []});
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

        if (retrieve_data.length > 0) {

          var collections = DataUtil.parseCollections(retrieve_data);

          var options = {
            "collections_ids": DataUtil.formatCollections(collections),
            "begin_time": getISODateTimeString(this.selected_time.start),
            "end_time": getISODateTimeString(this.selected_time.end)
          };


          var variables = [
            "F", "F_error", "B_NEC_resAC", "B_VFM", "B_error", "B_NEC", "Ne", "Te", "Vs",
            "U_orbit", "Bubble_Probability", "Kp", "Dst", "F107", "QDLat", "QDLon", "MLT",
            "Relative_STEC_RMS", "Relative_STEC", "Absolute_STEC", "Absolute_VTEC", "Elevation_Angle", "GPS_Position", "LEO_Position",
            "IRC", "IRC_Error", "FAC", "FAC_Error",
            "EEF", "RelErr", "OrbitNumber", "OrbitDirection", "QDOrbitDirection",
            "SunDeclination", "SunRightAscension", "SunHourAngle", "SunAzimuthAngle", "SunZenithAngle",
            "B_NEC_res_Model", "F_res_Model",
          ];

          var collectionList = _.chain(collections)
            .values()
            .flatten()
            .value();

          // See if magnetic data actually selected if not remove residuals
          var magSelected = _.any(collectionList, function (collection) {
            return collection.indexOf("MAG") !== -1;
          });

          if (!magSelected) {
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

          options.variables = variables.join(",");
          options.mimeType = 'application/msgpack';

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

          if (this.xhr !== null) {
            // A request has been sent that is not yet been returned so we need to cancel it
            Communicator.mediator.trigger("progress:change", false);
            this.xhr.abort();
            this.xhr = null;
          }

          this.xhr = httpRequest.asyncHttpRequest({
            context: this,
            type: 'POST',
            url: retrieve_data[0].url,
            data: wps_fetchDataTmpl(options),
            responseType: 'arraybuffer',

            parse: function (data, xhr) {
              return msgpack.decode(new Uint8Array(data));
            },

            opened: function () {
              Communicator.mediator.trigger("progress:change", true);
            },

            completed: function () {
              this.xhr = null;
              Communicator.mediator.trigger("progress:change", false);
            },

            error: function (xhr) {
              globals.swarm.set({data: {}});
              if (xhr.responseText === "") {return;}
              var error_text = xhr.responseText.match("<ows:ExceptionText>(.*)</ows:ExceptionText>");
              if (error_text && error_text.length > 1) {
                error_text = error_text[1];
              } else {
                error_text = 'Please contact feedback@vires.services if issue persists.';
              }
              showMessage('danger', ('Problem retrieving data: ' + error_text), 35);
            },

            success: function (dat) {

              var ids = {
                'A': 'Alpha',
                'B': 'Bravo',
                'C': 'Charlie',
                '-': 'NSC'
              };

              // Note: dat.__info__.sources contains a list of source products.
              var metadata = dat.__info__ || {};
              delete dat.__info__;

              if (dat.hasOwnProperty('Spacecraft')) {
                dat['id'] = [];
                for (var i = 0; i < dat.Timestamp.length; i++) {
                  dat.id.push(ids[dat.Spacecraft[i]]);
                }
              }

              if (dat.hasOwnProperty('Timestamp')) {
                for (var i = 0; i < dat.Timestamp.length; i++) {
                  dat.Timestamp[i] = new Date(dat.Timestamp[i] * 1000);
                }
              }
              if (dat.hasOwnProperty('timestamp')) {
                for (var i = 0; i < dat.Timestamp.length; i++) {
                  dat.Timestamp[i] = new Date(dat.timestamp[i] * 1000);
                }
              }
              if (dat.hasOwnProperty('latitude')) {
                dat['Latitude'] = dat['latitude'];
                delete dat.latitude;
              }
              if (dat.hasOwnProperty('longitude')) {
                dat['Longitude'] = dat['longitude'];
                delete dat.longitude;
              }
              if (!dat.hasOwnProperty('Radius')) {
                dat['Radius'] = [];
                var refKey = 'Timestamp';
                if (!dat.hasOwnProperty(refKey)) {
                  refKey = 'timestamp';
                }
                for (var i = 0; i < dat[refKey].length; i++) {
                  dat['Radius'].push(6832000);
                }
              }

              if (dat.hasOwnProperty('Latitude') && dat.hasOwnProperty('OrbitDirection')) {
                dat['Latitude_periodic'] = [];
                for (var i = 0; i < dat.Latitude.length; i++) {
                  if (dat.OrbitDirection[i] === 1) {
                    // range 90 -270
                    dat.Latitude_periodic.push(dat.Latitude[i] + 180);
                  } else if (dat.OrbitDirection[i] === -1) {
                    if (dat.Latitude[i] < 0) {
                      // range 0 - 90
                      dat.Latitude_periodic.push((dat.Latitude[i] * -1));
                    } else {
                      // range 270 - 360
                      dat.Latitude_periodic.push(360 - dat.Latitude[i]);
                    }

                  } else if (dat.OrbitDirection[i] === 0) {
                    //TODO what to do here? Should in principle not happen
                  }
                }
              }

              if (dat.hasOwnProperty('QDLat') && dat.hasOwnProperty('QDOrbitDirection')) {
                dat['QDLatitude_periodic'] = [];
                for (var i = 0; i < dat.QDLat.length; i++) {
                  if (dat.QDOrbitDirection[i] === 1) {
                    // range 90 -270
                    dat.QDLatitude_periodic.push(dat.QDLat[i] + 180);
                  } else if (dat.QDOrbitDirection[i] === -1) {
                    if (dat.QDLat[i] < 0) {
                      // range 0 - 90
                      dat.QDLatitude_periodic.push((dat.QDLat[i] * -1));
                    } else {
                      // range 270 - 360
                      dat.QDLatitude_periodic.push(360 - dat.QDLat[i]);
                    }

                  } else if (dat.QDOrbitDirection[i] === 0) {
                    //TODO what to do here? Should in principle not happen
                  }
                }
              }

              _.each(dat, function (data, key) {
                var components = VECTOR_BREAKDOWN[key];
                if (!components) {return;}
                dat[components[0]] = [];
                dat[components[1]] = [];
                dat[components[2]] = [];
                _.each(data, function (item) {
                  dat[components[0]].push(item[0]);
                  dat[components[1]].push(item[1]);
                  dat[components[2]].push(item[2]);
                });
                delete dat[key];
              });

              // This should only happen here if there has been
              // some issue with the saved filter configuration
              // Check if current brushes are valid for current data
              var idKeys = Object.keys(dat);
              var filters = globals.swarm.get('filters');
              var filtersSelec = JSON.parse(localStorage.getItem('filterSelection'));
              var filtersmodified = false;
              if (filters) {
                for (var f in filters) {
                  if (idKeys.indexOf(f) === -1) {
                    delete filters[f];
                    delete filtersSelec[f];
                    filtersmodified = true;
                  }
                }
                if (filtersmodified) {
                  globals.swarm.set('filters', filters);
                  localStorage.setItem('filterSelection', JSON.stringify(filtersSelec));
                }
              }

              globals.swarm.set({data: dat});
            },
          });
        }
      },

    });

    return new DataController();
  });

}).call(this);
