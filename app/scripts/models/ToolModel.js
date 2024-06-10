
(function () {
  'use strict';
  var root = this;
  root.define(['backbone', 'communicator'],
    function (Backbone, Communicator) {
      var ToolModel = Backbone.Model.extend({
        id: "",
        description: "",
        disabledDescription: "",
        active: false,
        enabled: true,
        icon: "",
        type: "",
        size: null
      });
      return {'ToolModel': ToolModel};
    });
}).call(this);
