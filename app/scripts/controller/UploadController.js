/* globals _ */

(function () {
  'use strict';

  var root = this;

  root.require([
    'backbone',
    'communicator',
    'globals',
    'app',
    'views/UploadView',
  ],

  function (Backbone, Communicator, globals, App, UploadView) {

    var UploadController = Backbone.Marionette.Controller.extend({

      initialize: function (options) {
        this.view = null;
        console.trace()
        this.listenTo(Communicator.mediator, "dialog:open:upload", this.showView);
      },

      showView: function () {
        if (!this.view) {
          this.view = new UploadView.UploadView();
        }
        App.viewContent.show(this.view);
      }

    });

    return new UploadController();
  });

}).call(this);
