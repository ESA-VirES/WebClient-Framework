(function() {
    'use strict';
    var root = this;
    root.define([
        'backbone',
        'communicator',
        'views/AuthView',
        'models/AuthModel',
        'hbs!tmpl/BulletLayer',
        'hbs!tmpl/iFrame',
        'globals',
        'app',
        'underscore'
    ],
    function( Backbone, Communicator, av, am, BulletLayerTmpl, iFrameTmpl, globals, App) {
        var LayerItemView = Backbone.Marionette.ItemView.extend({
            tagName: "li",
            events: {
                'drop' : 'drop',
                'change': 'onChange',
                'click .fa-adjust': 'onOpenSlider',
                'slide .ui-slider': 'onOpacityAdjust'
            },

            initialize: function(options) {

                this.$slider = $('<div>').slider({
                    range: "max",
                    max: 100,
                    min: 0
                });
                this.$slider.width(100);
                this.authview = null;
                this.activeDatasets = [];
            },
            onShow: function(view){

                this.listenTo(Communicator.mediator, "layer:activate", this.layerActivate);

                $( ".sortable" ).sortable({
                    revert: true,
                    delay: 90,
                    containment: "#products",
                    axis: "y",
                    forceHelperSize: true,
                    forcePlaceHolderSize: true,
                    placeholder: "sortable-placeholder",
                    handle: '.fa-sort',
                    start: function(event, ui) {
                        $( ".ui-slider" ).detach();
                        $('.fa-adjust').toggleClass('active')
                        $('.fa-adjust').popover('hide');
                    },
                    stop: function(event, ui) {
                        ui.item.trigger('drop', ui.item.index());
                    }
                });

                $('.fa-adjust').popover({
                    trigger: 'manual'
                });
                $('.fa-info-circle').popover({
                    trigger: 'focus',
                });

                var that = this;

                if(this.model.get("containerproduct")){
                    this.$el.find( ".fa-sort" ).remove();
                    this.$el.appendTo("#containerproductslist");
                    this.$el.find('.fa-sliders').click(function(){
                                
                    if (_.isUndefined(App.layerSettings.isClosed) || App.layerSettings.isClosed) {
                            App.layerSettings.setModel(that.model);
                            App.optionsBar.show(App.layerSettings);
                        } else {
                            if(App.layerSettings.sameModel(that.model)){
                                App.optionsBar.close();
                            }else{
                                App.layerSettings.setModel(that.model);
                                App.optionsBar.show(App.layerSettings);
                            }
                        }
                    });

                }else if (this.model.get('model')){
                    if (this.$el.has( ".fa-sliders" ).length){

                        if(this.model.get("satellite")==="Swarm"){
                            this.$el.find( ".fa-sort" ).css("visibility", "hidden");
                        }

                        if(this.model.get("timeSliderProtocol")==="INDEX"){
                            this.$el.find( ".fa-sliders" ).css("visibility", "hidden");
                            this.$el.find( ".fa-sort" ).css("visibility", "hidden");
                        }else{
                            this.$el.find('.fa-sliders').click(function(){
                                if(_.isUndefined(App.layerSettings.isClosed) || App.layerSettings.isClosed) {
                                    App.layerSettings.setModel(that.model);
                                    App.optionsBar.show(App.layerSettings);
                                } else {
                                    
                                    if(App.layerSettings.sameModel(that.model)){
                                        App.optionsBar.close();
                                    }else{
                                        App.layerSettings.setModel(that.model);
                                        App.optionsBar.show(App.layerSettings);
                                    }
                                }
                            });
                        }
                    }
                }
            },


            onChange: function(evt){

                var visible = evt.target.checked;
                var that = this;

                if (this.model.get('model') || this.model.get("containerproduct")){

                    if(visible){
                         // Activate setting directly when product is being activated
                        if (_.isUndefined(App.layerSettings.isClosed) || App.layerSettings.isClosed) {
                            App.layerSettings.setModel(this.model);
                            App.optionsBar.show(App.layerSettings);
                            $('#optionsBar').fadeTo(100, 0.3, function() {$(this).fadeTo(100, 1.0); });
                        } else {
                            if(!App.layerSettings.sameModel(this.model)){
                                App.layerSettings.setModel(this.model);
                                App.optionsBar.show(App.layerSettings);
                                $('#optionsBar').fadeTo(100, 0.3, function() { $(this).fadeTo(100, 1.0); });
                            }
                        }
                    } else {
                        if (!(_.isUndefined(App.layerSettings.isClosed) || App.layerSettings.isClosed)) {
                            App.optionsBar.close();
                        }
                    }
                   
                }

                if(this.model.get("containerproduct")){

                    if(visible){
                        this.model.set("visible", true);
                    }else{
                        this.model.set("visible", false);

                        var product_keys = _.keys(globals.swarm.products[this.model.get("id")]);

                        for (var i = product_keys.length - 1; i >= 0; i--) {
                            globals.products.forEach(function(p){
                                if(p.get("download").id == globals.swarm.products[that.model.get("id")][product_keys[i]]){
                                    if(p.get("visible")){
                                        p.set("visible", false);
                                        Communicator.mediator.trigger('map:layer:change', {
                                            name: p.get("name"),
                                            isBaseLayer: false,
                                            visible: false
                                        });
                                        var indexofactiveproduct = globals.swarm.activeProducts.indexOf(p.get("download").id);
                                        globals.swarm.activeProducts.splice(indexofactiveproduct, 1);
                                    }
                                }
                            });
                        }
                    }

                    if(visible){

                        if($('#alphacheck').is(':checked')){
                            if(globals.swarm.activeProducts.indexOf(globals.swarm.products[this.model.get("id")]['Alpha']) == -1){
                                globals.swarm.activeProducts.push(globals.swarm.products[this.model.get("id")]['Alpha']);
                            }
                        }
                        if ($('#bravocheck').is(':checked')){
                            if(globals.swarm.activeProducts.indexOf(globals.swarm.products[this.model.get("id")]['Bravo']) == -1){
                                globals.swarm.activeProducts.push(globals.swarm.products[this.model.get("id")]['Bravo']);
                            }
                        }
                        if($('#charliecheck').is(':checked')){
                            if(globals.swarm.activeProducts.indexOf(globals.swarm.products[this.model.get("id")]['Charlie']) == -1){
                                globals.swarm.activeProducts.push(globals.swarm.products[this.model.get("id")]['Charlie']);
                            }
                        }
                        if($('#nsccheck').is(':checked')){
                            if(globals.swarm.activeProducts.indexOf(globals.swarm.products[this.model.get("id")]['NSC']) == -1){
                                globals.swarm.activeProducts.push(globals.swarm.products[this.model.get("id")]['NSC']);
                            }
                        }
                        if($('#uploadcheck').is(':checked')){
                            if(globals.swarm.activeProducts.indexOf(globals.swarm.products[this.model.get("id")]['Upload']) == -1){
                                globals.swarm.activeProducts.push(globals.swarm.products[this.model.get("id")]['Upload']);
                            }
                        }
                    }

                    // Activate all other layers
                    for (var i = globals.swarm.activeProducts.length - 1; i >= 0; i--) {

                        globals.products.forEach(function(p){

                            if(p.get("download").id == globals.swarm.activeProducts[i]){
                                if(!p.get("visible")){
                                    p.set("visible", true);
                                    Communicator.mediator.trigger('map:layer:change', {
                                        name: p.get("name"),
                                        isBaseLayer: false,
                                        visible: true
                                    });
                                }
                                
                            }
                        });
                    }
                    Communicator.mediator.trigger('map:multilayer:change', globals.swarm.activeProducts);

                }else{
                    var isBaseLayer = false;
                    if (this.model.get('view').isBaseLayer)
                        isBaseLayer = true;

                    var options = { name: this.model.get('name'), isBaseLayer: isBaseLayer, visible: visible };


                    if( !isBaseLayer && evt.target.checked ){

                        var layer = globals.products.find(function(model) { return model.get('name') == options.name; });
                        if (layer != -1  && !(typeof layer === 'undefined')) {

                            if(options.visible){
                                this.model.set("visible", true);
                            }
                            else{
                                this.model.set("visible", false);
                            }

                            // TODO: Here we should go through all views, or maybe only url is necessary?
                            var url = layer.get('views')[0].urls[0]+"?";
                            //check if composed model has any expression
                            if(this.model.get("model_expression")===null || this.model.get("model_expression")===""){
                              showMessage('info','Please add at least one model to Composed model selection before activating this layer.', 20);

                              var checkbox = $( "input[type$='checkbox']", this.$el);
                              checkbox.prop( "checked", false );
                            }else if (url.indexOf('https') > -1){

                                var layer = layer.get('views')[0].id;
                                var req = "LAYERS=" + layer + "&TRANSPARENT=true&FORMAT=image%2Fpng&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A4326";
                                req += "&BBOX=33.75,56.25,33.80,56.50&WIDTH=2&HEIGHT=2";
                                // append composed model query part
                                if (this.model.get("model_expression") !== undefined){
                                  req += ("&MODELS=" + this.model.get("download").id + "=" + encodeURIComponent(this.model.get("model_expression")));
                                }
                                
                                req = url + req;

                                $.ajax({
                                    url: req,
                                    type: "GET",
                                    suppressErrors: true,
                                    xhrFields: {
                                      withCredentials: true
                                    },
                                    success: function(xml, textStatus, xhr) {
                                        Communicator.mediator.trigger('map:layer:change', options);
                                    },
                                    error: function(jqXHR, textStatus, errorThrown) {
                                        if (jqXHR.status == 403){
                                            showMessage('warning','You are not authorized to access this product.', 20);
                                        }else{
                                            this.authview = new av.AuthView({
                                                model: new am.AuthModel({url:req}),
                                                template: iFrameTmpl,
                                                layerprop: options
                                            });
                                            Communicator.mediator.trigger("progress:change", false);
                                            App.optionsBar.show(this.authview);
                                        }
                                    }
                                });
                            }else if(this.model.get('views')[0].protocol == "WPS"){
                                if(this.model.get('shc')){
                                    // If an shc file was loaded acticate layer as normal
                                    Communicator.mediator.trigger('map:layer:change', options);
                                }else{
                                    // If an shc file is not loaded open settings and show message to select shc file
                                    showMessage('info','Please click on Upload SHC and select a spherical harmonics coefficients file before activating this layer.', 20);

                                    var checkbox = $( "input[type$='checkbox']", this.$el);
                                    //checkbox.attr('checked', false);
                                    checkbox.prop( "checked", false );
                                    //checkbox.disableSelection();
                                }

                            }else{
                                Communicator.mediator.trigger('map:layer:change', options);
                            }
                        }else if (typeof layer === 'undefined'){
                            Communicator.mediator.trigger('map:layer:change', options);
                        }
                    } else if (!evt.target.checked){
                        Communicator.mediator.trigger('map:layer:change', options);
                    } else if (isBaseLayer && evt.target.checked){
                        Communicator.mediator.trigger('map:layer:change', options);
                    }
                }
            },

            drop: function(event, index) {
                Communicator.mediator.trigger('productCollection:updateSort', {model:this.model, position:index});
            },
            onOpenSlider: function(evt){

                if (this.$('.fa-adjust').toggleClass('active').hasClass('active')) {
                    this.$('.fa-adjust').popover('show');
                    this.$('.popover-content')
                        .empty()
                        .append(this.$slider);
                    this.$( ".ui-slider" ).slider( "option", "value", this.model.get("opacity") * 100 );


                } else {
                    this.$slider.detach();
                    this.$('.fa-adjust').popover('hide');
                }
            },

            onOpacityAdjust: function(evt, ui) {
                this.model.set("opacity", ui.value/100);
                Communicator.mediator.trigger('productCollection:updateOpacity', {model:this.model, value:ui.value/100});
            },

            layerActivate: function(layer){
                if(this.model.get('views') && this.model.get('views')[0].id == layer){
                    //this.model.set("visible", true);
                    var checkbox = $( "input[type$='checkbox']", this.$el);
                    //checkbox.attr('checked', true);
                    checkbox.prop( "checked", true );
                }

                if(this.model.hasOwnProperty('id') && this.model.get('id') == layer){
                    // Check for multiproduct datasets
                    var checkbox = $( "input[type$='checkbox']", this.$el);
                    checkbox.prop( "checked", true );
                }
            },

            onRender: function(){
                //TODO: This is a somwhat temporary solution, we need to think about
                // how we want to handle the DEM for the Virtual Globe
                if (this.model.get("name") == "Digital Elevation Model"){
                    this.$el.empty();
                }
             }

        });
        return {'LayerItemView':LayerItemView};
    });
}).call( this );
