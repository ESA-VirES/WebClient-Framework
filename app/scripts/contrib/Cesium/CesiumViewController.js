define([
    'backbone.marionette',
    'app',
    'communicator',
    './CesiumView'
], function(Marionette, App, Communicator, CesiumView) {

    'use strict';

    // The Controller takes care of the (private) implementation of a module. All functionality
    // is solely accessed via the controller. Therefore, also the Module.Router uses the Controller
    // for triggering actions caused by routing events.
    // The Controller has per definition only direct access to the View, it does not i.e. access
    // the Application object directly.
    var CesiumViewController = Backbone.Marionette.Controller.extend({

        initialize: function(opts) {
            this.id = opts.id;
            this.startPosition = opts.startPosition;
            this.cesiumView = new CesiumView({
                startPosition: opts.startPosition,
                //tileManager: this.tileManager
            });
        },

        getView: function(id) {
            return this.cesiumView;
        },

        centerAndZoom: function(x, y, l) {
            this.cesiumView.centerMap({
                x: x,
                y: y,
                l: l
            });
        },

        toggleDebug: function(){
            this.cesiumView.toggleDebug();
        },

        connectToView: function() {

            this.cesiumView.listenTo(Communicator.mediator, 'map:set:extent', 
                _.bind(this.cesiumView.onSetExtent, this.cesiumView)
            );
            this.cesiumView.listenTo(Communicator.mediator, 'map:change:zoom', 
                _.bind(this.cesiumView.onChangeZoom, this.cesiumView)
            );
            this.cesiumView.listenTo(Communicator.mediator, 'map:layer:change', 
                _.bind(this.cesiumView.changeLayer, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'productCollection:sortUpdated', 
                _.bind(this.cesiumView.onSortProducts, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'productCollection:updateOpacity', 
                _.bind(this.cesiumView.onUpdateOpacity, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'selection:activated', 
                _.bind(this.cesiumView.onSelectionActivated, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'selection:changed', 
                _.bind(this.cesiumView.onSelectionChanged, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'cesium:highlight:point', 
                _.bind(this.cesiumView.onHighlightPoint, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'cesium:highlight:removeAll', 
                _.bind(this.cesiumView.onRemoveHighlights, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'layer:parameters:changed', 
                _.bind(this.cesiumView.onLayerParametersChanged, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'layer:outlines:changed', 
                _.bind(this.cesiumView.onLayerOutlinesChanged, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'layer:colorscale:show', 
                _.bind(this.cesiumView.checkColorscale, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'time:change', 
                _.bind(this.cesiumView.onTimeChange, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'layout:switch:splitview', 
                _.bind(this.cesiumView.onResize, this.cesiumView)
            );
            this.cesiumView.listenTo(
                Communicator.mediator, 'layout:switch:singleview', 
                _.bind(this.cesiumView.onResize, this.cesiumView)
            );

            this.cesiumView.listenTo(
                Communicator.mediator, 'models:update',
                _.bind(this.cesiumView.onModelsUpdate, this.cesiumView)
            )
            
            Communicator.reqres.setHandler('map:get:extent', _.bind(this.cesiumView.onGetMapExtent, this.cesiumView));
            this.cesiumView.listenTo(
                this.cesiumView.model, 'change', function(model, options) {}
            );
        },

        getStartPosition: function() {
            return this.startPosition;
        },

        isActive: function(){
            return !this.cesiumView.isClosed;
        }
    });

    return CesiumViewController;
});
