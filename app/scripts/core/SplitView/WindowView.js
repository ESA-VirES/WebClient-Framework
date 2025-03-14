
define([
  'backbone.marionette',
  'hbs!tmpl/Window',
  'communicator'
], function (Marionette, WindowTmpl, Communicator) {

  'use strict';

  var WindowView = Marionette.Layout.extend({

    className: "windowview",

    template: {
      type: 'handlebars',
      template: WindowTmpl
    },

    regions: {
      viewport: '.viewport'
    },

    events: {
      'click .mapview-btn': function () {
        var options = {window: this, viewer: 'MapViewer'};
        Communicator.mediator.trigger('window:view:change', options);

      },

      'click .globeview-btn': function () {
        var options = {window: this, viewer: 'CesiumViewer'};
        Communicator.mediator.trigger('window:view:change', options);
      },

      'click .boxview-btn': function () {
        // var options = {window:this, viewer:'SliceViewer'};
        var options = {window: this, viewer: 'RectangularBoxViewer'};
        Communicator.mediator.trigger('window:view:change', options);
      },

      'click .sliceview-btn': function () {
        var options = {window: this, viewer: 'SliceViewer'};
        Communicator.mediator.trigger('window:view:change', options);
      },

      'click .analyticsview-btn': function () {
        var options = {window: this, viewer: 'AVViewer'};
        Communicator.mediator.trigger('window:view:change', options);
      }
    },

    initialize: function () {
      //this.view = null;
    },

    showView: function (view) {
      if (this.viewport.currentView) {
        this.viewport.currentView.close();
      }
      if (!view.isClosed) {
        view.close();
      }
      this.viewport.show(view);

      this.delegateEvents();
    }

  });

  return WindowView;
});
