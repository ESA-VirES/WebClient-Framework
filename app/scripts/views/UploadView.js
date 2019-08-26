/* global $ _ showMessage */

(function () {
  'use strict';

  var root = this;
  root.define([
    'backbone',
    'communicator',
    'globals',
    'hbs!tmpl/Upload',
    'filepond',
    'underscore'
  ], function (Backbone, Communicator, globals, UploadTemplate, FilePond) {

    var UploadView = Backbone.Marionette.ItemView.extend({
      tagName: "div",
      id: "modal-data-upload",
      className: "panel panel-default upload ui-draggable",
      template: {
        type: 'handlebars',
        template: UploadTemplate
      },

      modelEvents: {
        //"reset": "onCoveragesReset"
      },

      events: {
        //"click #btn-select-all-coverages": "onSelectAllCoveragesClicked",
        //"click #btn-invert-coverage-selection": "onInvertCoverageSelectionClicked",
        //'change input[type="checkbox"]': "onCoverageSelected",
        //"click #btn-start-download": "onStartDownloadClicked"
      },

      initialize: function (options) {
        this.uploads = globals.userData;
        //this.coverages = new Backbone.Collection([]);

        this.pond = this._createPond();

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
      },

      onShow: function (view) {
        this.$('.close').on("click", _.bind(this.onClose, this));
        this.$el.draggable({
          containment: "#content",
          scroll: false,
          handle: '.panel-heading'
        });
        this.$("#upload-pond-container")[0].appendChild(this.pond.element);
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

      onClose: function () {
        this.close();
      }
    });

    return {UploadView: UploadView};
  });
}).call(this);
