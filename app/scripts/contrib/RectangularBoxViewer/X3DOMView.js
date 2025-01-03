define([
  'core/BaseView'
], function (BaseView) {

  'use strict';

  // X3DOM is initializing the X3D elements found in the DOM when the library is loaded. As there are errors when
  // creating the X3D element after the loading of the library and x3dom.reload() did not work as expected this
  // X3DOMView takes care that there is always a X3D element in the DOM. However, the visual appeareance acts as
  // you would expect from a Marionette view, regarding its showing and closing in regions.

  // Usage:
  //
  // var X3DOMScene = X3DOMView.extend({
  // 	x3did: '#x3dom',    // -> the element id containing a X3D element or the X3D element id itself
  // 	hideid: '#hidden'   // -> the element id of a hidden (css: 'display: none') container in the DOM
  // });

  var X3DOMView = BaseView.extend({
    initialize: function (opts) {
      BaseView.prototype.initialize.call(this, opts);

      // FIXXME: document and change to a more general solution!
      this.$x3del = $('#' + opts.x3dtag_id);
      this.$hideel = $('#' + opts.hidden_id);

      if (!this.$x3del) {
        alert('[X3DOMView::initialize] Please specify a X3D element id or an element id containing an X3D element!');
      }

      if (!this.$hideel) {
        alert('[X3DOMView::initialize] Please specify an element id that acts as a hidden container!');
      }
    },

    onShow: function () {
      BaseView.prototype.onShow.call(this);
      this.$el.append(this.$x3del);
    },

    onClose: function () {
      this.$hideel.append(this.$x3del);
    },

    onResize: function () {
      var w = this.$x3del.parent().width();
      var h = this.$x3del.parent().parent().height();

      this.$x3del.width(w);
      this.$x3del.height(h);

      // Hardcoded as this element is created by the x3dom environment:
      $('.x3dom-canvas').attr("width", w);
      $('.x3dom-canvas').attr("height", h);
    }
  });

  return X3DOMView;
});