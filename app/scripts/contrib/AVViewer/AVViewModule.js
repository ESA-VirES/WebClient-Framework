define([
  'backbone.marionette',
  'app',
  'communicator',
  './AVViewController',
  './AVViewRouter'
], function (Marionette, App, Communicator, AVViewController, AVViewRouterController) {

  'use strict';

  App.module('AVViewer', function (Module) {

    this.startsWithParent = true;

    // This is the start routine of the module, called automatically by Marionette
    // after the core system is loaded. The module is responsible for creating its
    // private implementation, the Module.Controller. The Module.Controller is the
    // connected to the event system of the application via the Communicator.
    // Moreover the Router responsible for this module is activated in this routine.
    this.on('start', function (options) {
      this.instance = undefined;
      this.idx = 0;
      console.log('[AVViewerModule] Finished module initialization');
    });

    this.createController = function (opts) {
      var i = this.insance;
      if (this.insance === undefined) {
        i = new AVViewController({});
        this.insance = i;
      }
      return i;

    };
  });
});