/* global $ _ showMessage getISODateTimeString */

(function () {
  'use strict';

  var root = this;
  root.define([
    'backbone',
    'communicator',
    'globals',
    'hbs!tmpl/UploadManager',
    'hbs!tmpl/UploadItem',
    'hbs!tmpl/UploadParameter',
    'filepond',
    'underscore'
  ], function (Backbone, Communicator, globals, UploadManagerTemplate, UploadItemTemplate, UploadParameterTemplate, FilePond) {

    function _setConditionalClass($element, className, condition) {
      if (condition) {
        if (!$element.hasClass(className)) {
          $element.addClass(className);
        }
      } else {
        if ($element.hasClass(className)) {
          $element.removeClass(className);
        }
      }
    }

    var ParameterModel = Backbone.Model.extend({
      idAttribute: 'name',
      isNew: function () {
        return this.get('isNew');
      },
      isModified: function () {
        return this.get('value') != this.get('originalValue');
      },
      isFilled: function () {
        return this.get('value') != null;
      }
    });


    var ParameterCollection = Backbone.Collection.extend({
      model: ParameterModel,
      isModified: function () {
        return this.some(function (model) {return model.isModified();});
      },
      isFilled: function () {
        return this.every(function (model) {return model.isFilled();});
      },
      hasNew: function () {
        return this.some(function (model) {return model.isNew();});
      },
    });


    var ParameterView = Backbone.Marionette.ItemView.extend({
      tagName: "div",
      className: "form-group",
      template: {
        type: 'handlebars',
        template: UploadParameterTemplate
      },

      modelEvents: {
        'change': "onModelChange"
      },

      events: {
        'click #btn-remove-parameter': "removeParameter",
        'change input[type="text"]': "onInputChange"
      },

      onShow: function (view) {
        this.setInputValue(this.model.get('value'));
      },

      removeParameter: function () {
        this.model.collection.remove(this.model.id);
      },

      getInputValue: function () {
        return parseFloat(this.$('input[type="text"]').val());
      },

      setInputValue: function (value) {
        this.$('input[type="text"]').val(value);
        _setConditionalClass(this.$el, "has-error", value == null);
        _setConditionalClass(this.$el, "has-success", this.model.isModified());
      },

      onModelChange: function () {
        this.setInputValue(this.model.get('value'));
      },

      onInputChange: function () {
        var value = this.getInputValue();
        value = isNaN(value) ? this.model.get('originalValue') : value;
        this.model.set('value', value);
        this.setInputValue(value);
      }
    });


    var UploadItemView = Backbone.Marionette.CompositeView.extend({
      tagName: "div",
      className: "uplolad-item",
      template: {
        type: 'handlebars',
        template: UploadItemTemplate
      },
      itemView: ParameterView,
      itemViewContainer: "#extra-parameters",

      initialize: function (options) {
        this.collection = new ParameterCollection();
        var attributes = this.model.attributes;

        // missing mandatory fields
        _.each(attributes.missing_fields, _.bind(function (fieldInfo, name) {
          this.collection.add({
            name: name,
            required: true,
            value: null,
            originalValue: null
          });
        }, this));

        // special treatment of the optional Radius
        if (!attributes.fields.Radius && !attributes.constant_fields.Radius) {
          this.collection.add({
            name: "Radius",
            required: false,
            isNew: true,
            value: 6371200,
            originalValue: null
          });
        }

        // existing constant fields
        _.each(attributes.constant_fields, _.bind(function (fieldInfo, name) {
          this.collection.add({
            name: name,
            required: fieldInfo.required || false,
            value: fieldInfo.value,
            originalValue: fieldInfo.value
          });
        }, this));

        this.removed = {};
      },

      collectionEvents: {
        "change": "onParametersChange",
        "add": "onParametersChange",
        "remove": "onParameterRemove"
      },

      events: {
        "input #parameter-name-input": "onParameterNameInput",
        "click #btn-add-parameter": "onParameterAddRequest",
        "click #btn-update-item": "updateParameters",
        "click #btn-zoom-to-extent": "zoomToExtent",
        "click #btn-delete-item": "deleteItem"
      },

      onShow: function () {
        this.onParametersChange();
      },

      onParameterRemove: function (model) {
        if (!model.isNew()) {
          this.removed[model.id] = model.attributes;
        }
        this.onParametersChange();
      },

      onParametersChange: function () {
        var changed = (
          !_.isEmpty(this.removed) || this.collection.hasNew()
          || this.collection.isModified()
        ) && this.collection.isFilled();
        if (changed) {
          this.$("#btn-update-item").prop("disabled", false);
        } else {
          this.$("#btn-update-item").prop("disabled", true);
        }
      },

      onParameterAddRequest: function () {
        this.addNewParameter(this.getParameterName());
      },

      addNewParameter: function (name) {
        if (!name || this.parameterExists(name)) return;
        this.collection.add(this.removed[name] || {
          name: name,
          required: false,
          isNew: true,
          value: null,
          originalValue: null
        });
        this.setParameterName("");
      },

      onParameterNameInput: function () {
        var name = this.getParameterName();
        this.setParameterName(this.sanitizeParameterName(name));
      },

      sanitizeParameterName: function (name) {
        return name.replace(/^[0-9-]/, "").replace(/[^A-Za-z0-9_-]/g, "");
      },

      getParameterName: function () {
        return this.$("#parameter-name-input").val();
      },

      setParameterName: function (name) {
        $("#parameter-name-input").val(name);
        var isEmpty = (name === "");
        var parameterExists = !isEmpty && this.parameterExists(name);
        var $formGroup = $("#parameter-name-form-group");
        _setConditionalClass($formGroup, "has-error", !isEmpty && parameterExists);
        _setConditionalClass($formGroup, "has-success", !isEmpty && !parameterExists);
        $("#btn-add-parameter").prop("disabled", isEmpty || parameterExists);
      },

      parameterExists: function (name) {
        return (
          (this.collection.get(name) != null)
          || (_.indexOf(this.model.get('source_fields') || [], name) != -1)
        );
      },

      updateParameters: function () {
        var constantFields = {};
        this.collection.each(function (model) {
          constantFields[model.get('name')] = {value: model.get('value')};
        });
        this.model.save({constant_fields: constantFields}, {patch: true});
      },

      zoomToExtent: function () {
        var minSelection = 1000 * 60; // milliseconds
        var maxSelection = 1000 * 60 * 60 * 24 * 30; // milliseconds
        var start = Date.parse(this.model.get('start'));
        var end = Date.parse(this.model.get('end')) + 1;

        if ((end - start) < minSelection) end = start + minSelection;
        if ((end - start) > maxSelection) end = start + maxSelection;

        var domainStart = start - (end - start);
        var domainEnd = end + (end - start);

        Communicator.mediator.trigger('date:domain:change', {
          start: new Date(domainStart),
          end: new Date(domainEnd)
        });
        Communicator.mediator.trigger('date:selection:change', {
          start: new Date(start),
          end: new Date(end)
        });
      },

      deleteItem: function () {
        this.model.destroy();
      },

      templateHelpers: function () {
        function _truncateTime(isoDateString) {
          return getISODateTimeString(new Date(Date.parse(isoDateString)), true);
        }

        function _fancyByteSize(size) {
          if (size < 1024) {
            return size + " B";
          }
          var units = ['kB', 'MB', 'GB'];
          for (var i = 0; i < units.length; ++i) {
            size = size / 1024.0;
            if ((size < 1024) || (i + 1 == units.length)) {
              return size.toFixed(size < 10 ? 1 : 0) + " " + units[i];
            }
          }
        }

        var formats = {
          "text/csv": "CSV",
          "application/x-cdf": "CDF"
        };

        var attributes = this.model.attributes;

        return {
          _format: formats[attributes.content_type] || attributes.content_type,
          _size: _fancyByteSize(attributes.size),
          _start: _truncateTime(attributes.start),
          _end: _truncateTime(attributes.end),
          _created: _truncateTime(attributes.created),
          _missing_fields: _.map(
            attributes.missing_fields || {},
            function (value, key) {return key;}
          ).join(", "),
          _constant_fields: _.map(
            attributes.constant_fields || {},
            function (value, key) {return key;}
          )
        };
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

      collectionEvents: {
        "sync": "render",
        "change": "render"
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
      },

      onRender: function () {
        this.$('#btn-close-panel').on("click", _.bind(this.onClose, this));
        this.$("#upload-pond-container")[0].appendChild(this.pond.element);
      },

      onClose: function () {
        this.close();
      },

      onCompletedUpload: function () {
        globals.swarm.satellites['Upload'] = true;
        if (typeof(Storage) !== 'undefined') {
          localStorage.setItem('satelliteSelection', JSON.stringify(globals.swarm.satellites));
        }
        globals.userData.fetch();
      },

      onFailedUpload: function (response) {
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
