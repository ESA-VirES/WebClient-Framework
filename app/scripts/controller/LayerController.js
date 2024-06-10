(function () {
  'use strict';

  var root = this;

  root.require([
    'backbone',
    'communicator',
    'globals',
    'app'
  ],

  function (Backbone, Communicator, globals, App) {

    var LayerController = Backbone.Marionette.Controller.extend({

      initialize: function (options) {
        //this.listenTo(Communicator.mediator, "ui:open:layercontrol", this.onLayerControlOpen);
        this.listenTo(Communicator.mediator, "layer:activate", this.layerActivate);
        this.listenTo(Communicator.mediator, "app:reset", this.OnAppReset);
        this.listenTo(Communicator.mediator, "layers:refresh", this.refreshLayers);
        this.layercontrolopen = false;
      },

      /*onLayerControlOpen: function () {
               this.layercontrolopen = !this.layercontrolopen;
               if(this.layercontrolopen){
                    this.stopListening(Communicator.mediator, "ui:open:layercontrol");
               }else{
                    this.listenTo(Communicator.mediator, "ui:open:layercontrol", this.onLayerControlOpen);
               }
            },*/

      layerActivate: function (layer) {

        var layer_model = globals.products.find(function (model) {
          if (model.get('views'))
            return model.get('views')[0].id == layer;
          else
            return false;
        });

        var options = {};
        if (layer_model) {
          if (layer_model.get('visible')) {
            options = {name: layer_model.get('name'), isBaseLayer: false, visible: false};
            layer_model.set('visible', false);
          } else {
            options = {name: layer_model.get('name'), isBaseLayer: false, visible: true};
            layer_model.set('visible', true);
          }
          Communicator.mediator.trigger('map:layer:change', options);
        } else {
          layer_model = globals.swarm.filtered_collection.find(function (model) {
            if (model.get('id'))
              return model.get('id') == layer;
            else
              return false;
          });

          if (layer_model) {
            if (layer_model.get("visible")) {
              layer_model.set("visible", false);
            } else {
              layer_model.set("visible", true);
            }

            var product_keys = _.keys(globals.swarm.products[layer_model.get("id")]);
            //var activated_layers = [];

            for (var i = product_keys.length - 1; i >= 0; i--) {
              globals.products.forEach(function (p) {
                if (p.get("download").id == globals.swarm.products[layer_model.get("id")][product_keys[i]]) {
                  if (!p.get("visible") && globals.swarm.satellites[product_keys[i]]) {
                    p.set("visible", true);
                    Communicator.mediator.trigger('map:layer:change', {
                      name: p.get("name"),
                      isBaseLayer: false,
                      visible: true
                    });
                    globals.swarm.activeProducts.push(p.get("download").id);

                  } else {
                    if (p.get("visible") && !layer_model.get("visible")) {
                      p.set("visible", false);
                      Communicator.mediator.trigger('map:layer:change', {
                        name: p.get("name"),
                        isBaseLayer: false,
                        visible: false
                      });
                      var indexofactiveproduct = globals.swarm.activeProducts.indexOf(p.get("download").id);
                      globals.swarm.activeProducts.splice(indexofactiveproduct, 1);
                    }
                  }
                }
              });
            }

            Communicator.mediator.trigger('map:multilayer:change', globals.swarm.activeProducts);
          }
        }
      },

      refreshLayers: function () {
        var filteredCollection = globals.swarm['filtered_collection'];
        for (var i = globals.swarm.activeProducts.length - 1; i >= 0; i--) {
          globals.products.forEach(function (p) {
            if (p.get('download').id === globals.swarm.activeProducts[i]) {
              if (p.get('visible')) {
                p.set('visible', false);
                Communicator.mediator.trigger('map:layer:change', {
                  name: p.get('name'),
                  isBaseLayer: false,
                  visible: false
                });
              }
            }
          });
        }
        globals.swarm.activeProducts = [];
        filteredCollection.forEach(function (p) {
          if (p.get('containerproduct')) {
            if (p.get('visible')) {
              if (globals.swarm.satellites['Alpha']) {
                if (globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['Alpha']) === -1) {
                  globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['Alpha']);
                }
              }
              if (globals.swarm.satellites['Bravo']) {
                if (globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['Bravo']) === -1) {
                  globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['Bravo']);
                }
              }
              if (globals.swarm.satellites['Charlie']) {
                if (globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['Charlie']) === -1) {
                  globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['Charlie']);
                }
              }
              if (globals.swarm.satellites['NSC']) {
                if (globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['NSC']) === -1) {
                  globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['NSC']);
                }
              }
              if (globals.swarm.satellites['Upload']) {
                if (globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['Upload']) === -1) {
                  globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['Upload']);
                }
              }
            }
          }
        });

        for (var i = globals.swarm.activeProducts.length - 1; i >= 0; i--) {
          globals.products.forEach(function (p) {
            if (p.get('download').id === globals.swarm.activeProducts[i]) {
              if (!p.get('visible')) {
                p.set('visible', true);
                Communicator.mediator.trigger('map:layer:change', {
                  name: p.get('name'),
                  isBaseLayer: false,
                  visible: true
                });
              }
            }
          });
        }
        globals.swarm.activeProducts = globals.swarm.activeProducts.sort();
        Communicator.mediator.trigger('map:multilayer:change', globals.swarm.activeProducts);
      },

      OnAppReset: function () {
        // First deactivate all swarm container products
        globals.swarm.filtered_collection.each(function (layer) {
          if (layer.get("containerproduct")) {
            var products = globals.swarm.products[layer.get("id")];
            var product_keys = _.keys(products);
            layer.set("visible", false);

            for (var i = product_keys.length - 1; i >= 0; i--) {
              globals.products.forEach(function (p) {
                if (p.get("visible") && products[product_keys[i]] == p.get("download").id) {
                  p.set("visible", false);
                  Communicator.mediator.trigger('map:layer:change', {
                    name: p.get("name"),
                    isBaseLayer: false,
                    visible: false
                  });
                  var indexofactiveproduct = globals.swarm.activeProducts.indexOf(p.get("download").id);
                  globals.swarm.activeProducts.splice(indexofactiveproduct, 1);
                }
              });
            }
          }
        });

        Communicator.mediator.trigger('map:multilayer:change', globals.swarm.activeProducts);

        globals.products.each(function (layer) {

          if (layer.get('visible')) {
            var options = {name: layer.get('name'), isBaseLayer: false, visible: false};
            layer.set('visible', false);
            Communicator.mediator.trigger('map:layer:change', options);
          }

        });


        // Should do this in the content or data controller but need to make sure layers are first deactivated
        Communicator.mediator.trigger("selection:changed", null);
      }
    });
    return new LayerController();
  });

}).call(this);