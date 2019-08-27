/* global $ _ showMessage */

(function () {
  'use strict';

  var root = this;
  root.define([
    'backbone',
    'communicator',
    'globals',
    'hbs!tmpl/UploadManager',
    'hbs!tmpl/UploadItem',
    'filepond',
    'underscore'
  ], function (Backbone, Communicator, globals, UploadManagerTemplate, UploadItemTemplate, FilePond) {

    var UploadItemView = Backbone.Marionette.ItemView.extend({
      tagName: "div",
      className: "uplolad-item",
      template: {
        type: 'handlebars',
        template: UploadItemTemplate
      },
      templateHelpers: function () {
        return {
          _missing_fields: _.map(
            this.model.get("missing_fields") || {},
            function (value, key) {return key;}
          ),
          _extra_fields: _.map(
            this.model.get("extra_fields") || {},
            function (value, key) {return key;}
          )
        };
      },
      events: {
        "click #delete-item": "deleteItem"
      },
      deleteItem: function () {
        this.model.destroy();
      }
    });

    var UploadView = Backbone.Marionette.CompositeView.extend({
      tagName: "div",
      id: "modal-data-upload",
      className: "panel panel-default upload ui-draggable",
      template: {
        type: 'handlebars',
        template: UploadManagerTemplate
      },
      itemView: UploadItemView,
      itemViewContainer: "#upload-items",

      modelEvents: {
      },

      events: {
        "click #close-panel": "onClose"
      },

      initialize: function (options) {
        this.uploads = globals.userData;
        this.pond = this._createPond();
      },

      onShow: function (view) {
        this.$el.draggable({
          containment: "#content",
          scroll: false,
          handle: '.panel-heading'
        });
        this.$("#upload-pond-container")[0].appendChild(this.pond.element);
      },

      onClose: function () {
        this.close();
      },

      onCompletedUpload: function () {
        console.trace();
        globals.swarm.satellites['Upload'] = true;
        if (typeof(Storage) !== 'undefined') {
          localStorage.setItem('satelliteSelection', JSON.stringify(globals.swarm.satellites));
        }
        globals.userData.fetch();
      },

      onFailedUpload: function (response) {
        console.trace();
        showMessage('danger', 'The user file upload failed: ' + response, 30);
      },

      _createPond: function () {
        var pond = FilePond.create({
          allowMultiple: false,
          labelIdle: (
            '<span class="filepond--label-action">' +
            'Upload file by dragging & dropping or selecting it.' +
            '</span>'
          ),
          name: 'file',
          onaddfilestart: function () {
            $('#fpfilenamelabel').remove();
          },
          server: {
            url: 'custom_data/',
            revert: null,
            restore: null,
            load: null,
            fetch: null,
            process: {
              onload: _.bind(this.onCompletedUpload, this),
              onerror: _.bind(this.onFailedUpload, this),
            }
          }
        });

        pond.on('processfile', function (error, file) {
          if (error) {
            console.error(error);
            return;
          }
          $('#fpfilenamelabel').remove();
          pond.removeFile(file.id);
        });

        return pond;
      }
    });

    return {UploadView: UploadView};
  });
}).call(this);
