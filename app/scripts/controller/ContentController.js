(function() {
    'use strict';
    var root = this;
    root.require([
        'backbone',
        'communicator',
        'app',
        'globals'
    ],
    function( Backbone, Communicator, App , globals) {

        var ContentController = Backbone.Marionette.Controller.extend({
            configKeys: [
                'serviceVersion', 'mapSceneMode', 'selectedFilterList',
                'timeSelection', 'timeDomain', 'areaSelection', 'viewSelection',
                'productsConfiguration', 'activeOverlays', 'activeBaselayer',
                'cameraPosition', 'xAxisSelection', 'plotConfiguration',
                'parameterConfiguration', 'filterSelection', 'filtersMinimized',
            ],
            initialize: function(options){
                this.listenTo(Communicator.mediator, "dialog:open:about", this.onDialogOpenAbout);
                this.listenTo(Communicator.mediator, "ui:open:layercontrol", this.onLayerControlOpen);
                this.listenTo(Communicator.mediator, "ui:open:toolselection", this.onToolSelectionOpen);
                this.listenTo(Communicator.mediator, "ui:open:options", this.onOptionsOpen);
                this.listenTo(Communicator.mediator, "ui:open:storybanner", this.StoryBannerOpen);
                this.listenTo(Communicator.mediator, "app:reset", this.OnAppReset);
                this.listenTo(Communicator.mediator, "layer:open:settings", this.onOpenLayerSettings);
                this.listenTo(Communicator.mediator, "ui:fullscreen:globe", this.onFullscrenGlobe);
                this.listenTo(Communicator.mediator, "ui:fullscreen:analytics", this.onFullscrenAnalytics);
                this.listenTo(Communicator.mediator, "application:reset", this.onApplicationReset);
                this.listenTo(Communicator.mediator, "application:save", this.onApplicationSave);
                this.listenTo(Communicator.mediator, "application:load", this.onApplicationLoad);
                this.listenTo(Communicator.mediator, "dialog:show:upload", this.onShowUpload);
            },

            onFullscrenGlobe: function () {
                Communicator.mediator.trigger("layout:switch:singleview", "CesiumViewer");
            },

            onFullscrenAnalytics: function () {
                Communicator.mediator.trigger('layout:switch:singleview', 'AVViewer');
                //Communicator.mediator.trigger("region:show:view", 'tl','AVViewer');
            },

            onDialogOpenAbout: function(event){
                App.dialogRegion.show(App.DialogContentView);
            },

            onShowUpload: function () {
                if($('#uploadDialogContainer').is(':visible')) {
                    $('#uploadDialogContainer').hide();
                } else {
                    $('#uploadDialogContainer').show();
                }
            },

            onLayerControlOpen: function(event){
                //We have to render the layout before we can
                //call show() on the layout's regions
                if (_.isUndefined(App.layout.isClosed) || App.layout.isClosed) {
                    App.leftSideBar.show(App.layout);
                    App.layout.baseLayers.show(App.baseLayerView);
                    App.layout.products.show(App.productsView);
                    App.layout.overlays.show(App.overlaysView);
                } else {
                    App.layout.close();
                }
               
            },
            onToolSelectionOpen: function(event){
                if (_.isUndefined(App.toolLayout.isClosed) || App.toolLayout.isClosed) {
                    App.rightSideBar.show(App.toolLayout);
                    App.toolLayout.selection.show(App.selectionToolsView);
                    App.toolLayout.visualization.show(App.visualizationToolsView);
                    App.toolLayout.mapmode.show(App.visualizationModesView);
                } else {
                    App.toolLayout.close();
                }
            },
            onOptionsOpen: function(event){
                if (_.isUndefined(App.optionsLayout.isClosed) || App.optionsLayout.isClosed) {
                    App.optionsBar.show(App.optionsLayout);
                    App.optionsLayout.colorramp.show(App.colorRampView);
                } else {
                    App.optionsLayout.close();
                }
            },

            StoryBannerOpen: function(event){

                // Instance StoryBanner view
                App.storyBanner = new App.views.StoryBannerView({
                    template: App.templates[event]
                });
                
                if (_.isUndefined(App.storyView.isClosed) || App.storyView.isClosed) {
                    //if (confirm('Starting the tutorial will reset your current view, are you sure you want to continue?')) {
                        App.storyView.show(App.storyBanner);
                    //}
                    
                } else {
                    App.storyView.close();
                }

            },

            OnAppReset: function(){
                App.layout.close();
                App.toolLayout.close();
                App.optionsLayout.close();
                App.optionsBar.close();
            },

            onOpenLayerSettings: function(layer){

                var product = false;
                for (var i = 0; i < globals.products.models.length; i++) {
                    if(globals.products.models[i].get("views")[0].id==layer){
                        product = globals.products.models[i];
                    }
                }
                
                if(!product){
                    for (var i = 0; i < globals.swarm.filtered_collection.models.length; i++) {
                        if(globals.swarm.filtered_collection.models[i].get("id")==layer){
                            product = globals.swarm.filtered_collection.models[i];
                        }
                    }
                }

                if (_.isUndefined(App.layerSettings.isClosed) || App.layerSettings.isClosed) {
                    App.layerSettings.setModel(product);
                    App.optionsBar.show(App.layerSettings);
                } else {
                    if(App.layerSettings.sameModel(product)){
                        App.optionsBar.close();
                    }else{
                        App.layerSettings.setModel(product);
                        App.optionsBar.show(App.layerSettings);
                    }
                }

            },
            onApplicationReset: function(){
                if (typeof(Storage) !== "undefined") {
                    localStorage.clear();
                    localStorage.setItem(
                        'serviceVersion',
                        JSON.stringify(globals.version)
                    );
                    // prevent client state double posting
                    if (window.history.replaceState) {
                        window.history.replaceState(null, null, window.location.href);
                    }
                    location.reload(true);
                }
            },

            onApplicationSave: function() {
                if (typeof(Storage) === "undefined") return;

                var config = {};
                _.each(this.configKeys, function (key) {
                    var item = localStorage.getItem(key);
                    console.log(key, item)
                    if (item !== null) {
                        config[key] = JSON.parse(item);
                    }
                }, this);

                var blob = new Blob([JSON.stringify(config)], {
                  type: 'application/json;charset=utf-8'
                });

                var date = new Date();
                var filename = (
                    date.getUTCFullYear()
                    + padLeft(String(date.getUTCMonth() + 1), "0", 2)
                    + padLeft(String(date.getUTCDate()), "0", 2) + "T"
                    + padLeft(String(date.getUTCHours()), "0", 2)
                    + padLeft(String(date.getUTCMinutes()), "0", 2)
                    + padLeft(String(date.getUTCSeconds()), "0", 2)
                ) + '_vires_settings.json'

                saveAs(blob, filename);
            },

            onApplicationLoad: function () {
                if (typeof(Storage) === "undefined") return;

                var storeConfig = _.bind(function (data) {
                    var config = JSON.parse(data);
                    if (!config['update'] !== true) {
                      localStorage.clear();
                    }
                    _.each(this.configKeys, function (key) {
                        var value = config[key];
                        if ((value !== undefined) && (value !== null)) {
                            localStorage.setItem(key, JSON.stringify(value));
                        }
                    }, this);
                }, this);

                $('#fileInputJSON').remove();
                var infield = $('<input id="fileInputJSON" type="file" name="name" style="display: none;" />');
                $('body').append(infield);
                $('#fileInputJSON').on('change', function (event) {
                    var reader = new FileReader();
                    reader.onload = function (event) {
                        storeConfig(event.target.result);
                        window.location.reload();
                    };
                    reader.readAsText(event.target.files[0]);
                });
                $('#fileInputJSON').trigger('click');
            }

        });
        return new ContentController();
    });

}).call( this );
