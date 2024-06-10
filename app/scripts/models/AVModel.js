
(function () {
  'use strict';
  var root = this;
  root.define(['backbone', 'communicator'],
    function (Backbone, Communicator) {
      var AVModel = Backbone.Model.extend({

      });
      return {'AVModel': AVModel};
    });
}).call(this);