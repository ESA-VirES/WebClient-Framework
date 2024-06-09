(function () {
  'use strict';

  var root = this;

  root.define([
    'backbone',
    'communicator',
    'globals',
    'underscore'
  ],

  function (Backbone, Communicator, globals) {

    var ContentView = Backbone.Marionette.ItemView.extend({
      templateHelpers: function () {
        return {version: globals.version};
      },
      initialize: function (options) {
      },
    });

    return {"ContentView": ContentView};

  });

}).call(this);
