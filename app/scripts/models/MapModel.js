

(function () {
  'use strict';

  var root = this;

  root.define([
    'backbone',
    'communicator'
  ],

  function (Backbone, Communicator) {

    var MapModel = Backbone.Model.extend({
      visualizationLibs: [],
      center: [],
      zoom: 0,
      moon: true,
      sun: true,
      skyBox: true,
      backgroundColor: "#000"
    });

    return {"MapModel": MapModel};

  });

}).call(this);