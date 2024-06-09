(function () {
  'use strict';

  var root = this;

  root.define([
    'backbone',
    'communicator',
    'hbs!tmpl/OptionsControl',
    'underscore'
  ],

  function (Backbone, Communicator, OptionsControlTmpl) {

    var ColorRampControl = Backbone.Marionette.Layout.extend({

      template: {type: 'handlebars', template: OptionsControlTmpl},
      regions: {
        colorramp: "#colorramp",
      },
      className: "panel panel-default optionscontrol not-selectable",

      initialize: function (options) {
      },

      onShow: function (view) {
        this.$('.close').on("click", _.bind(this.onClose, this));
        this.$el.draggable({
          containment: "#main",
          scroll: false,
          handle: '.panel-heading'
        });
      },

      onClose: function () {
        this.close();
      }

    });

    return ColorRampControl;

  });

}).call(this);
