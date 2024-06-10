define([
  'backbone.marionette',
  'app',
  'communicator',
  './SplitView',
  './WindowView'
], function (Marionette, App, Communicator, SplitView, WindowView) {

  'use strict';

  var SplitViewController = Marionette.Controller.extend({

    initialize: function () {
      this.view = new SplitView();
      this.connectToView();

      this.windowViews = {
        tl: new WindowView(),
        tr: new WindowView(),
        bl: new WindowView(),
        br: new WindowView()
      };
      this.view.registerViews(this.windowViews);
    },

    getView: function () {
      return this.view;
    },

    registerViews: function (views) {
      this.view.registerViews(views);
    },

    connectToView: function () {
      this.listenTo(Communicator.mediator, "layout:switch:singleview", this.setSinglescreen);
      this.listenTo(Communicator.mediator, "layout:switch:splitview", this.setSplitscreen);
      this.listenTo(Communicator.mediator, "layout:switch:quadview", this.setQuadscreen);
      this.listenTo(Communicator.mediator, "window:view:change", this.onChangeView);
      this.listenTo(Communicator.mediator, "region:show:view", this.onShowView);
    },

    onShowView: function (regionid, viewid) {
      this.windowViews[regionid].showView(App.module(viewid).createController().getView());
    },

    setSinglescreen: function (viewtype) {
      this.view.showViewInRegion('tl', 'view1');

      this.view.setFullscreen('view1');

      if ($(".view1").hasClass("ui-resizable")) {
        $(".view1").resizable('destroy');
      }


      this.windowViews.tl.showView(App.module(viewtype).createController().getView());
      if (viewtype !== 'AVViewer') {
        this.windowViews.tr.close();
      }

      //this.windowViews.tr.triggerMethod('view:disconnect');
    },

    setSplitscreen: function () {

      this.view.showViewInRegion('tl', 'view1');
      this.view.showViewInRegion('tr', 'view2');
      this.view.setSplitscreen();

      this.windowViews.tl.showView(App.module('CesiumViewer').createController().getView());
      this.windowViews.tr.showView(App.module('AVViewer').createController().getView());

      $(".view1").resizable({
        handles: 'e'
      });
    },

    setQuadscreen: function (regionid) {

      this.view.showViewInRegion('tl', 'view1');
      this.view.showViewInRegion('tr', 'view2');
      this.view.showViewInRegion('bl', 'view3');
      this.view.showViewInRegion('br', 'view4');
      this.view.setQuadscreen();

      this.windowViews.tl.showView(App.module('MapViewer').createController().getView());
      this.windowViews.tr.showView(App.module('VirtualGlobeViewer').createController().getView());
      this.windowViews.br.showView(App.module('AVViewer').createController().getView());
      this.windowViews.bl.showView(App.module('SliceViewer').createController().getView());
    },

    onChangeView: function (options) {
      _.each(this.windowViews, function (view) {
        if (view === options.window) {
          view.showView(App.module(options.viewer).createController().getView());
        }
      }, this);

    }
  });

  return SplitViewController;
});