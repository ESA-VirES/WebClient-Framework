(function () {
  'use strict';

  var root = this;

  root.require([
    'backbone',
    'communicator',
    'globals',
    'app',
    'views/DownloadView',
    'views/DownloadFilterView',
    'models/DownloadModel'
  ],

  function (Backbone, Communicator, globals, App, v, v2, m) {

    var DownloadController = Backbone.Marionette.Controller.extend({
      model: new m.DownloadModel(),

      initialize: function (options) {
        //App.downloadView.model = this.model;
        this.model.set('products', {});
        this.listenTo(Communicator.mediator, "map:layer:change", this.onChangeLayer);
        this.listenTo(Communicator.mediator, 'time:change', this.onTimeChange);
        this.listenTo(Communicator.mediator, "selection:changed", this.onSelectionChange);
        this.listenTo(Communicator.mediator, "dialog:open:download", this.onDownloadToolOpen);
        this.listenTo(Communicator.mediator, "analytics:set:filter", this.onDownloadSetFilter);
        this.listenTo(Communicator.mediator, "dialog:open:download:filter", this.onDownloadToolFilterOpen);
        this.listenTo(Communicator.mediator, 'manual:init', this.onManualInit);
      },

      onManualInit: function () {
        var products = this.model.get('products');
        for (var i = 0; i < globals.products.models.length; i++) {
          var p = globals.products.models[i];
          if (p.get('visible') && p.get('download').url) {
            products[p.get('download').id] = p;
          } else {
            delete products[p.get('download').id];
          }
          this.model.set('products', products);
        }
      },

      onChangeLayer: function (options) {
        if (!options.isBaseLayer) {
          var layer = globals.products.find(function (model) {return model.get('name') == options.name;});
          if (layer) { // Layer will be empty if it is an overlay layer
            var products = this.model.get('products');
            // without url currently filters out user uploaded data
            if (options.visible && layer.get('download').url) {
              products[layer.get('download').id] = layer;
            } else {
              delete products[layer.get('download').id];
            }
            this.model.set('products', products);
          }
        }
        this.checkDownload();
      },

      onTimeChange: function (time) {
        this.model.set('ToI', time);
        this.checkDownload();
      },

      onDownloadSetFilter: function (filter) {
        this.model.set('filter', filter);
      },

      onSelectionChange: function (bbox) {
        if (bbox != null) {
          this.model.set('AoI', bbox);
        } else {
          this.model.set('AoI', null);
        }
        this.checkDownload();
      },

      checkDownload: function () {
        // Check that all necessary selections are available
        if (this.model.get('ToI') != null &&
               this.model.get('AoI') != null &&
               _.size(this.model.get('products')) > 0) {
          Communicator.mediator.trigger('selection:enabled', {id: "download", enabled: true});
        } else {
          Communicator.mediator.trigger('selection:enabled', {id: "download", enabled: false});
        }
      },

      onDownloadToolOpen: function (toOpen) {
        if (toOpen) {
          App.viewContent.show(new v.DownloadView({model: this.model}));
        } else {
          App.viewContent.close();
        }
      },


      onDownloadToolFilterOpen: function (toOpen) {
        if (toOpen) {
          App.viewContent.show(new v2.DownloadFilterView({model: this.model}));
        } else {
          App.viewContent.close();
        }
      }


    });
    return new DownloadController();
  });

}).call(this);