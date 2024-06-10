define([
  'backbone.marionette',
  'app',
  './AVViewController'
], function (Marionette, App, AVViewController) {

  'use strict';

  // The RouterController provides the (private) implementation of the Router. Internally it
  // maps routing events to functionality provided by the Module.Controller.
  var AVViewRouterController = Marionette.Controller.extend({

    initialize: function (analytics_controller) {
      this.analyticsController = analytics_controller;
    },

    show: function () {
      this.analyticsController.show();
    }
  });

  return AVViewRouterController;
});