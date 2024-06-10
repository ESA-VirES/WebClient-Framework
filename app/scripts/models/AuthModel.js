
(function () {
  'use strict';
  var root = this;
  root.define(['backbone', 'communicator'],
    function (Backbone, Communicator) {
      var AuthModel = Backbone.Model.extend({
        url: ''
      });
      return {'AuthModel': AuthModel};
    });
}).call(this);