/*
 * Selection widget:
 *
 * Responsible for providing 2D and 3D selection tools for the virtual globe.
 *
 * Author: Martin Hecher <martin.hecher@fraunhofer.at>
 *
 * License: TBD
 */

define(['./Point',
  './AOIItem',
  'globals',
  'communicator'
], function (Point, AOIItem, globals, Communicator) {

  AOIRenderer = function (globe, navigation, aoiLayer) {
    this._globe = globe;
    this._navigation = navigation;
    this._aoiItems = [];
    this._mouseButtonDown = false;
    this._mode = "polygonal";
    this._curAoiItem = null;
    this._onSelectionCallback = null;
    this._shiftKey = false;
    this._inRectangular = false; // FIXXME: quick hack for the moment...
    this._aoiLayer = aoiLayer;
    this._aoiLayer['mytoken'] = 42;
    this._selectionType = null;
    this.colors = globals.objects.get("color");

    this.enableSelection = function (type, selectionType) {
      this._selectionType = selectionType;
      if (selectionType == "single") {
        this._aoiLayer.removeAllFeatures();
        this._aoiItems = [];
      }

      this.start();
    };

    this.disableSelection = function () {
      this._aoiLayer.removeAllFeatures();
      this._aoiItems = [];
      this.stop();
    };

    this.removeFeatures = function () {
      this._aoiLayer.removeAllFeatures();
      this._aoiItems = [];
    };

    this.addAOI = function (coords, color) {
      var aoiItem = new AOIItem(this._aoiLayer);
      aoiItem.setUnclosedCoordinates(coords);
      if (typeof color !== 'undefined') {
        aoiItem.setColor(color);
      }
      aoiItem.render();
      this._aoiItems.push(aoiItem);
    };

    this.start = function () {
      this._navigation.stop();

      var canvas = this._globe.renderContext.canvas;

      // Note: the handler functions need to be defined as a local scope variable within
      // the AOIRenderer. Otherwise it is not possible to remove the handlers in the
      // 'stop' method. (the natural approach would be to define the handler methods as
      // member methods and bind them to the 'this' pointer in 'addEventListener', however,
      // the 'removeEventListener' call will not work via this approach).
      canvas.addEventListener("mousedown", _handleOnMouseDown);
      canvas.addEventListener("mousemove", _handleOnMouseMove);
      canvas.addEventListener("mouseup", _handleOnMouseUp);

      canvas.addEventListener("contextmenu", this._handleOnContextMenu.bind(this));

      console.debug("[AOIRenderer::start] called");
    };

    this.stop = function () {
      this._onSelectionEnd();

      var canvas = this._globe.renderContext.canvas;

      canvas.removeEventListener("mousedown", _handleOnMouseDown);
      canvas.removeEventListener("mousemove", _handleOnMouseMove);
      canvas.removeEventListener("mouseup", _handleOnMouseUp);

      canvas.removeEventListener("contextmenu", this._handleOnContextMenu);

      console.debug("[AOIRenderer::stop] called");

      this._navigation.start();
    };

    this.setOnSelectionStartCallback = function (cb) {
      this._onSelectionStartCallback = cb;
    };

    this.setOnSelectionEndCallback = function (cb) {
      this._onSelectionEndCallback = cb;
    };

    this.setOnSelectionMoveCallback = function (cb) {
      this._inSelectionMoveCallback = cb;
    };

    this.updateCurrent = function () {
      this._curAoiItem.render();
    };

    this._onSelectionStart = function () {
      if (this._onSelectionStartCallback) {
        this._onSelectionStartCallback(this._curAoiItem._coords);
      }
    };

    this._onSelectionEnd = function () {
      if (this._onSelectionEndCallback && this._curAoiItem) {
        this._onSelectionEndCallback(this._curAoiItem._coords);
      }
      this._curAoiItem = null;
    };

    this._onSelectionMove = function () {
      if (this._onSelectionMoveCallback) {
        this._onSelectionMoveCallback(this._curAoiItem._coords);
      }
    };

    this._storePoint = function (evt) {
      var pos = this._globe.renderContext.getXYRelativeToCanvas(evt);
      var lonlat = this._globe.getLonLatFromPixel(pos[0], pos[1]);
      this._curAoiItem.add(new Point(lonlat));
    };

    this._getLatLngPoint = function (evt) {
      var pos = this._globe.renderContext.getXYRelativeToCanvas(evt);
      var lonlat = this._globe.getLonLatFromPixel(pos[0], pos[1]);

      return new Point(lonlat);
    };

    var _handleOnMouseDown = function (evt) {
      this._mouseButtonDown = true;
      var colorindex = this._aoiItems.length + 1;
      if (evt.which === 1) {
        if (!this._curAoiItem) {
          if (this._selectionType == "single") {
            this._aoiLayer.removeAllFeatures();
            this._aoiItems = [];
            Communicator.mediator.trigger("selection:changed", null);
            colorindex = this._aoiItems.length;
          }
          var pos = this._globe.renderContext.getXYRelativeToCanvas(evt);
          var lonlat = this._globe.getLonLatFromPixel(pos[0], pos[1]);

          var selection = new AOIItem(this._aoiLayer);


          var color = this.colors(colorindex);
          var c = _hexToRGB(color);

          this._aoiItems.push(selection);

          selection.setColor([c.r / 255, c.g / 255, c.b / 255, 1]);

          this._curAoiItem = selection;
        }

        this._curAoiItem.add(this._getLatLngPoint(evt));

        if (this._curAoiItem.getNumPoints() > 1) {
          this._inRectangular = true;
        }

      }
    }.bind(this);

    var _hexToRGB = function (hex) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };

    var _handleOnMouseMove = function (evt) {
      if (evt.which === 1) {
        if (this._mouseButtonDown && !this._inRectangular) {

          this._navigation.stop();
          this._mode = "rectangular";

          var start_point = this._curAoiItem.getStartPoint().clone();
          var cur_point = this._getLatLngPoint(evt);

          this._curAoiItem.clear();
          this._curAoiItem.add(start_point);
          this._curAoiItem.add(new Point([cur_point.x, start_point.y]));
          this._curAoiItem.add(cur_point);
          this._curAoiItem.add(new Point([start_point.x, cur_point.y]));

          this.updateCurrent();
        }
      }
    }.bind(this);

    var _handleOnMouseUp = function (evt) {
      if (evt.which === 1) {
        this._mouseButtonDown = false;

        if (this._mode === "rectangular") {
          var start_point = this._curAoiItem.getStartPoint().clone();
          var cur_point = this._getLatLngPoint(evt);

          this._curAoiItem.clear();
          this._curAoiItem.add(start_point);
          this._curAoiItem.add(new Point([cur_point.x, start_point.y]));
          this._curAoiItem.add(cur_point);
          this._curAoiItem.add(new Point([start_point.x, cur_point.y]));

          this.updateCurrent();
          this._onSelectionEnd();

          this._navigation.start();
          this._mode = "polygonal";
        } else {
          if (evt.button === 0) { // left button
            this._curAoiItem.add(this._getLatLngPoint(evt));
            this._curAoiItem.render();
          } else if (evt.button === 2) { // right button
            this._onSelectionEnd();
          }
        }

        this._inRectangular = false;
      }
    }.bind(this);

    this._handleOnContextMenu = function (evt) {
      evt.preventDefault();
    };
  };
  return AOIRenderer;
});