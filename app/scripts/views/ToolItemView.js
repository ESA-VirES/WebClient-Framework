(function () {
  'use strict';
  var root = this;
  root.define([
    'backbone',
    'communicator',
    'hbs!tmpl/BulletLayer',
    'underscore'
  ],
  function (Backbone, Communicator, BulletLayerTmpl) {
    var ToolItemView = Backbone.Marionette.ItemView.extend({
      events: {
        'click': 'onClick'
      },

      initialize: function (options) {
        this.listenTo(Communicator.mediator, "selection:activated", this.onSelectionActivated);
        this.listenTo(Communicator.mediator, "tool:activated", this.onToolActivated);
        this.listenTo(Communicator.mediator, "ui:close", this.onDialogClose);
        this.listenTo(Communicator.mediator, "selection:enabled", this.onSelectionEnabled);
      },

      onClick: function (evt) {
        if (this.model.get('enabled')) {
          if (this.model.get('type') == 'selection') {
            if (this.model.get('active')) {
              Communicator.mediator.trigger('selection:activated', {id: this.model.get('id'), active: false, selectionType: this.model.get('selectionType')});
              this.model.set({active: false});
            } else {
              Communicator.mediator.trigger('selection:activated', {id: this.model.get('id'), active: true, selectionType: this.model.get('selectionType')});
              this.model.set({active: true});
            }
          } else {
            if (this.model.get('active')) {
              Communicator.mediator.trigger('tool:activated', {id: this.model.get('id'), active: false, selectionType: this.model.get('selectionType')});
              Communicator.mediator.trigger(this.model.get('eventToRaise'), false);
              this.model.set({active: false});
            } else {
              Communicator.mediator.trigger('tool:activated', {id: this.model.get('id'), active: true, selectionType: this.model.get('selectionType')});
              Communicator.mediator.trigger(this.model.get('eventToRaise'), true);
              this.model.set({active: true});
            }
          }
          this.render();
        }
      },
      onSelectionActivated: function (arg) {
        if (arg.active) {
          if (this.model.get('id') != arg.id && this.model.get('active')) {
            this.model.set({active: false});
            this.render();
          }
        }
      },

      onToolActivated: function (arg) {
        if (arg.active) {
          if (this.model.get('id') != arg.id && this.model.get('active')) {
            this.model.set({active: false});
            this.render();
          }
        }
      },

      onDialogClose: function (id) {
        if (this.model.get('id') == id) {
          this.model.set({active: false});
          this.render();
        }
      },

      onSelectionEnabled: function (arg) {
        if (this.model.get('id') == arg.id) {
          this.model.set({enabled: arg.enabled});
          this.render();
        }
      },
      onRender: function () {
        if (this.$el.is("div")) {
          this.setElement($(this.$el.children()[0]).unwrap());
        } else if (this.$el.is("button")) {
          this.setElement($(this.$el.children()[0]).unwrap());
        }

        var size = this.model.get('size');
        if (size == null) {
          var x, y;
          if (this.$el.outerHeight() != 0)
            y = this.$el.outerHeight();
          if (this.$el.outerWidth() != 0)
            x = this.$el.outerWidth();
          if (x && y) {
            size = {x: x, y: y};
            this.model.set('size', size);
          }
        }

        if (!this.model.get('enabled')) {
          if (!this.d && size) {
            this.d = $("<div>");

            this.d.css({
              height: size.y,
              width: size.x,
              position: "relative",
              "margin-top": '-' + size.y + 'px'
            });
            this.d.attr('title', this.model.get('disabledDescription'));
            this.$el.after(this.d);
          }

        } else {
          this.$el.attr('title', this.model.get('description'));

          if (this.d) {
            this.d.remove();
            this.d = null;
          }
        }
      },

      onClose: function () {
        if (this.d) {
          this.d.remove();
          this.d = null;
        }
      },

      onShow: function () {
        var size = this.model.get('size');
        if (size == null) {
          var x, y;
          if (this.$el.outerHeight() != 0)
            y = this.$el.outerHeight();
          if (this.$el.outerWidth() != 0)
            x = this.$el.outerWidth();
          if (x && y) {
            size = {x: x, y: y};
            this.model.set('size', size);
          }
        }

        if (!this.model.get('enabled')) {
          if (!this.d && size) {
            this.d = $("<div>");

            this.d.css({
              height: size.y,
              width: size.x,
              position: "relative",
              "margin-top": '-' + size.y + 'px'
            });
            this.d.attr('title', this.model.get('disabledDescription'));
            this.$el.after(this.d);
          }

        } else {
          this.$el.attr('title', this.model.get('description'));
        }
      }

    });
    return {'ToolItemView': ToolItemView};
  });
}).call(this);
