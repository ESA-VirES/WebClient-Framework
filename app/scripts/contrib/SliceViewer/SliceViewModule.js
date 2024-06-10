define([
  'backbone.marionette',
  'app',
  'communicator',
  './SliceViewController'
], function (Marionette, App, Communicator, SliceViewController, SliceViewRouter) {

  'use strict';

  App.module('SliceViewer', function (Module) {

    // Disabled module for now as it is not needed
    this.startsWithParent = false;

    this.on('start', function (options) {
      this.instances = {};
      this.idx = 0;

      console.log('[SliceViewer] Finished module initialization');
    });

    this.createController = function (opts) {
      var id = null;

      // Go through instances and return first free one
      for (var contr in this.instances) {
        if (!this.instances[contr].isActive()) {
          console.log("Free SliceViewer returned " + contr);
          return this.instances[contr];
        }
      }

      // If there are no free insances create a new one
      if (typeof id === 'undefined') {
        id = 'SliceViewer.' + this.idx++;
      }

      var controller = new SliceViewController();
      this.instances[id] = controller;

      return controller;
    };
  });
});