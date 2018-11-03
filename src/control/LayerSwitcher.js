/*	Copyright (c) 2015 Jean-Marc VIGLINO, 
	released under the CeCILL-B license (French BSD license)
	(http://www.cecill.info/licences/Licence_CeCILL-B_V1-en.txt).
*/

import {inherits as ol_inherits} from 'ol'
import {unByKey as ol_Observable_unByKey} from 'ol/Observable'
import ol_control_Control from 'ol/control/Control'
import ol_layer_Tile from 'ol/layer/Tile'
import ol_layer_Vector from 'ol/layer/Vector'
import ol_layer_VectorTile from 'ol/layer/VectorTile'
import ol_layer_Image from 'ol/layer/Image'
import ol_layer_Heatmap from 'ol/layer/Heatmap'
import {intersects as ol_extent_intersects} from 'ol/extent'

/**
 * @classdesc OpenLayers 3 Layer Switcher Control.
 * @require jQuery
 * @fires drawlist
 * 
 * @constructor
 * @extends {ol_control_Control}
 * @param {Object=} options
 *	@param {function} displayInLayerSwitcher function that takes a layer and return a boolean if the layer is displayed in the switcher, default test the displayInLayerSwitcher layer attribute
 *	@param {boolean} options.show_progress show a progress bar on tile layers, default false
 *	@param {boolean} mouseover show the panel on mouseover, default false
 *	@param {boolean} reordering allow layer reordering, default true
 *	@param {boolean} trash add a trash button to delete the layer, default false
 *	@param {function} oninfo callback on click on info button, if none no info button is shown DEPRECATED: use on(info) instead
 *	@param {boolean} extent add an extent button to zoom to the extent of the layer
 *	@param {function} onextent callback when click on extent, default fits view to extent
 *
 * Layers attributes that control the switcher
 *	- allwaysOnTop {boolean} true to force layer stay on top of the others while reordering, default false
 *	- displayInLayerSwitcher {boolean} display in switcher, default true
 *	- noSwitcherDelete {boolean} to prevent layer deletion (w. trash option = true), default false
 */
var ol_control_LayerSwitcher = function(options)
{	options = options || {};
	var self = this;
	this.dcount = 0;
	this.show_progress = options.show_progress;
	this.oninfo = (typeof (options.oninfo) == "function" ? options.oninfo: null);
	this.onextent = (typeof (options.onextent) == "function" ? options.onextent: null);
	this.hasextent = options.extent || options.onextent;
	this.hastrash = options.trash;
	this.reordering = (options.reordering!==false);
	this._events = {
		opacity: {},
		reordering: {}
	};

	// displayInLayerSwitcher
	if (typeof(options.displayInLayerSwitcher) === 'function') {
		this.displayInLayerSwitcher = options.displayInLayerSwitcher;
	}

	var element;
	if (options.target)
	{	element = document.createElement("div");
		element.className = options.switcherClass || "ol-layerswitcher";
	}
	else
	{	element = document.createElement("div");
		element.className = ((options.switcherClass || 'ol-layerswitcher') + ' ol-unselectable ol-control ol-collapsed').trim();

		this.button = document.createElement("button");
		this.button.setAttribute('type','button');
		this.button.addEventListener("touchstart", function(e)
					{	element.classList.toggle("ol-collapsed");
						e.preventDefault();
						self.overflow();
					});
		this.button.addEventListener("click", function()
					{	element.classList.toggle("ol-forceopen");
						element.classList.add("ol-collapsed");
						self.overflow();
					});
		element.appendChild(this.button);
		if (options.mouseover)
		{	element.addEventListener("mouseleave", function(){ element.classList.add("ol-collapsed"); })
			element.addEventListener("mouseover", function(){ element.classList.remove("ol-collapsed"); });
		}
		this.topv = document.createElement("div");
		this.topv.classList.add("ol-switchertopdiv");
		this.topv.addEventListener("click", function(){ self.overflow("+50%"); })
		element.appendChild(this.topv);
		this.botv = document.createElement("div");
		this.botv.classList.add("ol-switcherbottomdiv")
		this.botv.addEventListener("click", function(){ self.overflow("-50%"); });
		element.appendChild(this.botv);
	}
	this.panel_ = document.createElement("ul");
	this.panel_.classList.add("panel");
	element.appendChild(this.panel_);

	var mouseWheelEventFunction = function(e)
		{	if (self.overflow(Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)))))
			{	e.stopPropagation();
				e.preventDefault();
			}
		}
	this.panel_.addEventListener('mousewheel', mouseWheelEventFunction);
	this.panel_.addEventListener('DOMMouseScroll', mouseWheelEventFunction);
	this.panel_.addEventListener('onmousewheel', mouseWheelEventFunction);
	this.header_ = document.createElement("li");
	this.header_.classList.add("ol-header");
	this.panel_.appendChild(this.header_);


	ol_control_Control.call(this,
	{	element: element,
		target: options.target
	});

	// Enable jQuery dataTransfert
	// $.event.props.push('dataTransfer');
	this.target = options.target;

};
ol_inherits(ol_control_LayerSwitcher, ol_control_Control);


/** List of tips for internationalization purposes
*/
ol_control_LayerSwitcher.prototype.tip =
{	up: "up/down",
	down: "down",
	info: "informations...",
	extent: "zoom to extent",
	trash: "remove layer",
	plus: "expand/shrink"
};

/** Test if a layer should be displayed in the switcher
 * @param {ol.layer} layer
 * @return {boolean} true if the layer is displayed
 */
ol_control_LayerSwitcher.prototype.displayInLayerSwitcher = function(layer) {
	return (layer.get("displayInLayerSwitcher")!==false);
};

/**
 * Set the map instance the control is associated with.
 * @param {_ol_Map_} map The map instance.
 */
ol_control_LayerSwitcher.prototype.setMap = function(map)
{   ol_control_Control.prototype.setMap.call(this, map);
	this.drawPanel();

	if (this._listener) {
		if (this._listener) ol_Observable_unByKey(this._listener.change);
		if (this._listener) ol_Observable_unByKey(this._listener.moveend);
		if (this._listener) ol_Observable_unByKey(this._listener.size);
	}
	this._listener = null;

	this.map_ = map;
	// Get change (new layer added or removed)
	if (map)
	{	this._listener = {
			change: map.getLayerGroup().on('change', this.drawPanel.bind(this)),
			moveend: map.on('moveend', this.viewChange.bind(this)),
			size: map.on('change:size', this.overflow.bind(this))
		}
	}
};

/** Add a custom header

*/
ol_control_LayerSwitcher.prototype.setHeader = function(html)
{	this.header_.appendChild(html);
};

/** Calculate overflow and add scrolls
*	@param {Number} dir scroll direction -1|0|1|'+50%'|'-50%'
*/
ol_control_LayerSwitcher.prototype.overflow = function(dir)
{	
	if (this.button) 
	{	// Nothing to show
		if (this.panel_.style.display == 'none')
		{	this.element.style.height = "auto";
			return;
		}
		// Calculate offset
		var h = this.element.offsetHeight;
		var hp = this.panel_.offsetHeight;
		var dh = this.button.offsetTop + (
			this.button.offsetHeight +
			parseInt(getComputedStyle(this.button).marginTop) +
			parseInt(getComputedStyle(this.button).marginBottom)
		);
		var top = this.panel_.offsetTop-dh;
		if (hp > h-dh)
		{	// Bug IE: need to have an height defined
			this.element.style.height = "100%";
			switch (dir)
			{	case 1: top += 2*this.panel_.querySelector("li.visible .li-content").clientHeight; break;
				case -1: top -= 2*this.panel_.querySelector("li.visible .li-content").clientHeight; break;
				case "+50%": top += Math.round(h/2); break;
				case "-50%": top -= Math.round(h/2); break;
				default: break;
			}
			// Scroll div
			if (top+hp <= h-3*dh/2)
			{	top = h-3*dh/2-hp;
				this.botv.style.display = "none";
			}
			else
			{	this.botv.style.display = "";
			}
			if (top >= 0)
			{	top = 0;
				this.topv.style.display = "none";
			}
			else
			{	this.topv.style.display = "";
			}
			// Scroll ?
			this.panel_.style.top = top+"px";
			return true;
		}
		else
		{	this.element.style.height = "auto";
			this.panel_.style.top = "0px";
			this.botv.style.display = "none";
			this.topv.style.display = "none"
			return false;
		}
	}
	else return false;
};

/**
 * On view change hide layer depending on resolution / extent
 * @param {ol.event} map The map instance.
 * @private
 */
ol_control_LayerSwitcher.prototype.viewChange = function(e)
{
	var map = this.map_;
	var res = this.map_.getView().getResolution();
	Array.prototype.slice.call(this.panel_.querySelectorAll("li")).forEach(function(li)
	{	var l = li.dataLayer;
		if (l)
		{	if (l.getMaxResolution()<=res || l.getMinResolution()>=res) li.classList.add("ol-layer-hidden");
			else
			{	var ex0 = l.getExtent();
				if (ex0)
				{	var ex = map.getView().calculateExtent(map.getSize());
					if (!ol_extent_intersects(ex, ex0))
					{	li.classList.add("ol-layer-hidden");
					}
					else li.classList.remove("ol-layer-hidden");
				}
				else li.classList.remove("ol-layer-hidden");
			}
		}
	});
};

/**
 *	Draw the panel control (prevent multiple draw due to layers manipulation on the map with a delay function)
 */
ol_control_LayerSwitcher.prototype.drawPanel = function(e)
{
	if (!this.getMap()) return;
	var self = this;
	// Multiple event simultaneously / draw once => put drawing in the event queue
	this.dcount++;
	setTimeout (function(){ self.drawPanel_(); }, 0);
};

/** Delayed draw panel control 
 * @private
 */
ol_control_LayerSwitcher.prototype.drawPanel_ = function(e)
{	if (--this.dcount || this.dragging_) return;
	Array.prototype.slice.call(this.panel_.querySelectorAll("li")).forEach(function(li) {
		if (!(li.classList.contains("ol-header"))) {
			li.parentNode.removeChild(li);
		}
	});
	this.drawList (this.panel_, this.getMap().getLayers());
};

/** Change layer visibility according to the baselayer option
 * @param {ol.layer}
 * @param {Array<ol.layer>} related layers
 */
ol_control_LayerSwitcher.prototype.switchLayerVisibility = function(l, layers)
{
	if (!l.get('baseLayer')) l.setVisible(!l.getVisible());
	else
	{	if (!l.getVisible()) l.setVisible(true);
		layers.forEach(function(li)
		{	if (l!==li && li.get('baseLayer') && li.getVisible()) li.setVisible(false);
		});
	}
};

/** Check if layer is on the map (depending on zoom and extent)
 * @param {ol.layer}
 * @return {boolean}
 */
ol_control_LayerSwitcher.prototype.testLayerVisibility = function(layer)
{
	if (this.map_)
	{	var res = this.map_.getView().getResolution();
		if (layer.getMaxResolution()<=res || layer.getMinResolution()>=res) return false;
		else
		{	var ex0 = layer.getExtent();
			if (ex0)
			{	var ex = this.map_.getView().calculateExtent(this.map_.getSize());
				return ol_extent_intersects(ex, ex0);
			}
			return true;
		}
	}
	return true;
};


/** Start ordering the list
*	@param {event} e drag event
*	@private
*/
ol_control_LayerSwitcher.prototype.dragOrdering_ = function(e)
{	e.data = this;
	var drag = e.data;
	switch (e.type)
	{	// Start ordering
		case 'mousedown':
		case 'touchstart':
		{	e.stopPropagation();
			e.preventDefault();
			var pageY = e.pageY
					|| (e.originalEvent.touches && e.originalEvent.touches.length && e.originalEvent.touches[0].pageY) 
					|| (e.originalEvent.changedTouches && e.originalEvent.changedTouches.length && e.originalEvent.changedTouches[0].pageY);
			drag =
				{	self: drag.self,
					elt: e.currentTarget.closest("li"),
					start: true,
					element: drag.self.element,
					panel: drag.self.panel_,
					pageY: pageY
				};
			drag.elt.parentElement.classList.add('drag');
			["mouseup", "mousemove", "touchend", "touchcancel", "touchmove"].forEach(function(eventName) {
				drag.self._events.reordering[eventName] = drag.self.dragOrdering_.bind(drag);
				document.addEventListener(eventName, drag.self._events.reordering[eventName]);
			})
			break;
		}
		// Stop ordering
		case 'touchcancel':
		case 'touchend':
		case 'mouseup':
		{	if (drag.target)
			{	// Get drag on parent
				var drop = drag.layer;
				var target = drag.target;
				if (drop && target)
				{	var collection ;
					if (drag.group) collection = drag.group.getLayers();
					else collection = drag.self.getMap().getLayers();
					var layers = collection.getArray();
					// Switch layers
					for (var i=0; i<layers.length; i++)
					{	if (layers[i]==drop)
						{	collection.removeAt (i);
							break;
						}
					}
					for (var j=0; j<layers.length; j++)
					{	if (layers[j]==target)
						{	if (i>j) collection.insertAt (j,drop);
							else collection.insertAt (j+1,drop);
							break;
						}
					}
				}
			}

			drag.elt.parentElement.querySelector("li").classList.remove("dropover", "dropover-after", "dropover-before");
			drag.elt.classList.remove("drag");
			drag.elt.parentElement.classList.remove("drag");
			drag.element.classList.remove('drag');
			if (drag.div) drag.div.parentNode.removeChild(drag.div);
			["mouseup", "mousemove", "touchend", "touchcancel", "touchmove"].forEach(function(eventName) {
				document.removeEventListener(eventName, drag.self._events.reordering[eventName]);
			})
			break;
		}
		// Ordering
		case 'mousemove':
		case 'touchmove':
		{	// First drag (more than 2 px) => show drag element (ghost)
			var pageY = e.pageY
					|| (e.originalEvent.touches && e.originalEvent.touches.length && e.originalEvent.touches[0].pageY) 
					|| (e.originalEvent.changedTouches && e.originalEvent.changedTouches.length && e.originalEvent.changedTouches[0].pageY);
			if (drag.start && Math.abs(drag.pageY - pageY) > 2)
			{	drag.start = false;
				drag.elt.classList.add("drag");
				drag.layer = drag.elt.dataLayer;
				drag.target = false;
				drag.group = drag.elt.parentElement.parentElement.dataLayer;
				// Ghost div
				drag.div = document.createElement("li");
				drag.panel.appendChild(drag.div);
				drag.div.style.position = "absolute";
				drag.div.style.zIndex = 10000;
				drag.div.style.left = drag.elt.offsetLeft;
				drag.div.style.opacity = 0.5;
				drag.div.innerHTML = drag.elt.innerHTML;
				drag.div.classList.add("ol-dragover")
				drag.div.clientWidth = drag.elt.offsetWidth;
				drag.div.clientHeight = drag.elt.clientHeight;
				drag.element.classList.add('drag');
			}
			if (!drag.start)
			{	e.preventDefault();
				e.stopPropagation();

				// Ghost div
				var ghost_offset_top = drag.panel.getBoundingClientRect().top + window.pageYOffset - document.documentElement.clientTop;
				drag.div.style.top = String(pageY - ghost_offset_top + (drag.panel.pageYOffset ? drag.panel.pageYOffset : 0) + 5) + 'px';

				var li;
				if (!e.touches) li = e.target;
				else li = document.elementFromPoint(e.touches[0].clientX, e.originalEvent.touches[0].clientY);
				if (li.classList.contains("ol-switcherbottomdiv"))
				{	drag.self.overflow(-1);
					console.log('bottom')
				}
				else if (li.classList.contains("ol-switchertopdiv"))
				{	drag.self.overflow(1);
				}
				if (!li.nodeName.toLowerCase() == "li") li = li.closest("li");
				if (!li.classList.contains('dropover')) drag.elt.parentElement.querySelector("li").classList.remove("dropover", "dropover-after", "dropover-before");
				if (li.parentElement.classList.contains('drag') && li !== drag.elt)
				{	var target = li.dataLayer;
					// Don't mix layer level
					if (target && !target.get("allwaysOnTop") == !drag.layer.get("allwaysOnTop"))
					{	li.classList.add("dropover");
						li.classList.add((drag.elt.offsetTop < li.offsetTop)?"dropover-after":"dropover-before");
						drag.target = target;
					}
					else
					{	drag.target = false;
					}
					drag.div.style.display = '';
				}
				else
				{	drag.target = false;
					if (li === drag.elt) drag.div.style.display = 'none';
					else drag.div.style.display = '';
				}

				if (!drag.target) drag.div.classList.add("forbidden");
				else drag.div.classList.remove("forbidden");
			}
			break;
		}
		default: break;

	}
};


/** Change opacity on drag
*	@param {event} e drag event
*	@private
*/
ol_control_LayerSwitcher.prototype.dragOpacity_ = function(e)
{	e.data = this;
	var drag = e.data;
	switch (e.type)
	{	// Start opacity
		case 'mousedown':
		case 'touchstart':
		{	e.stopPropagation();
			e.preventDefault();
			drag.start = e.pageX
					|| (e.touches && e.touches.length && e.touches[0].pageX)
					|| (e.changedTouches && e.changedTouches.length && e.changedTouches[0].pageX);
			drag.elt = e.target;
			drag.layer = drag.elt.closest("li").dataLayer;
			drag.self = this.self;
			drag.self.dragging_ = true;
			// console.log(this.dragging_);
			["mouseup", "touchend", "mousemove", "touchmove", "touchcancel"].forEach(function(eventName) {
					drag.self._events.opacity[eventName] = drag.self.dragOpacity_.bind(drag);
					document.addEventListener(eventName, drag.self._events.opacity[eventName]);
			});
			break;
		}
		// Stop opacity
		case 'touchcancel':
		case 'touchend':
		case 'mouseup':
		{
			["mouseup", "touchend", "mousemove", "touchmove", "touchcancel"].forEach(function(eventName) {
					document.removeEventListener(eventName, drag.self._events.opacity[eventName]);
			})
			drag.layer.setOpacity(drag.opacity);
			drag.elt.parentElement.nextElementSibling.textContent = Math.round(drag.opacity*100);
			drag.self.dragging_ = false;
			// drag = false;
			break;
		}
		// Move opacity
		default:
		{	var x = e.pageX
				|| (e.touches && e.touches.length && e.touches[0].pageX) 
				|| (e.changedTouches && e.changedTouches.length && e.changedTouches[0].pageX);
			var offset_left_parent = drag.elt.parentElement.getBoundingClientRect().left + window.pageXOffset - document.documentElement.clientLeft;
			var dx = Math.max ( 0, Math.min( 1, (x - offset_left_parent) / drag.elt.parentElement.clientWidth ));
			drag.elt.style.left = (dx*100)+"%";
			drag.elt.parentElement.nextElementSibling.textContent = Math.round(drag.opacity*100);
			drag.opacity = dx;
			drag.layer.setOpacity(dx);
			break;
		}
	}
}


/** Render a list of layer
 * @param {elt} element to render
 * @layers {Array{ol.layer}} list of layer to show
 * @api stable
 */
ol_control_LayerSwitcher.prototype.drawList = function(ul, collection)
{	var self = this;
	var layers = collection.getArray();
	var setVisibility = function(e)
	{	e.stopPropagation();
		e.preventDefault();
		var l = this.parentElement.parentElement.dataLayer;
		self.switchLayerVisibility(l,collection);
	};
	function moveLayer (l, layers, inc)
	{
		for (var i=0; i<layers.getLength(); i++)
		{	if (layers.item(i) === l)
			{	layers.remove(l);
				layers.insertAt(i+inc, l);
				return true;
			}
			if (layers.item(i).getLayers && moveLayer (l, layers.item(i).getLayers(), inc)) return true;
		}
		return false;
	};
	function moveLayerUp(e)
	{	e.stopPropagation();
		e.preventDefault();
		moveLayer(this.closest('li').dataLayer, self.map_.getLayers(), +1);
	};
	function moveLayerDown(e)
	{	e.stopPropagation();
		e.preventDefault();
		moveLayer(this.closest('li').dataLayer, self.map_.getLayers(), -1);
	};
	function onInfo(e)
	{	e.stopPropagation();
		e.preventDefault();
		var l = this.closest('li').dataLayer;
		self.oninfo(l);
		self.dispatchEvent({ type: "info", layer: l });
	};
	function zoomExtent(e)
	{	e.stopPropagation();
		e.preventDefault();
		var l = this.closest('li').dataLayer;
		if (self.onextent) self.onextent(l);
		else self.map_.getView().fit (l.getExtent(), self.map_.getSize());
		self.dispatchEvent({ type: "extent", layer: l });
	};
	function removeLayer(e)
	{	e.stopPropagation();
		e.preventDefault();
		var li = this.closest('ul').parentElement;
		if (li.dataLayer)
		{	li.dataLayer.getLayers().remove(this.closest('li').dataLayer);
			if (li.dataLayer.getLayers().getLength()==0 && !li.dataLayer.get('noSwitcherDelete'))
			{	removeLayer.call(li.querySelector(".layerTrash"), e);
			}
		}
		else self.map_.removeLayer(this.closest('li').dataLayer);
	};

	// Add the layer list
	for (var i=layers.length-1; i>=0; i--)
	{	var layer = layers[i];
		if (!self.displayInLayerSwitcher(layer)) continue;

		var li = document.createElement("li");
		if (layer.getVisible()) {
			li.classList.add("visible");
		}
		if (layer.get('baseLayer')) {
			li.classList.add("baselayer");
		}
		li.dataLayer = layer;
		ul.appendChild(li);

		var layer_buttons = document.createElement("div");
				layer_buttons.classList.add("ol-layerswitcher-buttons");
				li.appendChild(layer_buttons);

		var d = document.createElement("div");
				d.classList.add('li-content');
				li.appendChild(d);
		if (!this.testLayerVisibility(layer)) d.classList.add("ol-layer-hidden");

		// Visibility
		var div_input_visibility = document.createElement("input");
				div_input_visibility.setAttribute('type', layer.get('baseLayer') ? 'radio' : 'checkbox');
				// div_input_visibility.checked = layer.getVisible();
				if (layer.getVisible()) {
					div_input_visibility.setAttribute('checked', 'checked');
				} else {
					div_input_visibility.removeAttribute('checked');
				}
				div_input_visibility.addEventListener('click', setVisibility);
				d.appendChild(div_input_visibility);

		// Label
		var label = document.createElement("label");
				label.textContent = layer.get("title") || layer.get("name");
				label.setAttribute('title', layer.get("title") || layer.get("name"));
				label.setAttribute('unselectable', 'on');
				label.style.userSelect = 'none';
				label.addEventListener('click', setVisibility);
				label.addEventListener('selectstart', function(){ return false; })
				d.appendChild(label);

		//  up/down
		if (this.reordering)
		{	if ( (i<layers.length-1 && (layer.get("allwaysOnTop") || !layers[i+1].get("allwaysOnTop")) )
				|| (i>0 && (!layer.get("allwaysOnTop") || layers[i-1].get("allwaysOnTop")) ) )
			{		var tip_up = document.createElement("div");
							tip_up.classList.add("layerup")
							tip_up.setAttribute("title", this.tip.up)
							tip_up.addEventListener("mousedown", self.dragOrdering_.bind({self: this}));
							tip_up.addEventListener("touchstart", self.dragOrdering_.bind({self: this}));
					layer_buttons.appendChild(tip_up);
			}
		}

		// Show/hide sub layers
		if (layer.getLayers)
		{	var nb = 0;
			layer.getLayers().forEach(function(l)
			{	if (self.displayInLayerSwitcher(l)) nb++;
			});
			if (nb)
			{	var tip_plus = document.createElement("div");
						tip_plus.classList.add(layer.get("openInLayerSwitcher") ? "collapse-layers" : "expend-layers" );
						tip_plus.setAttribute("title", this.tip.plus)
					tip_plus.addEventListener("click", function()
					{	var l = this.closest('li').dataLayer;
						l.set("openInLayerSwitcher", !l.get("openInLayerSwitcher") )
					})

					layer_buttons.appendChild(tip_plus);
			}
		}

		// $("<div>").addClass("ol-separator").appendTo(layer_buttons);

		// Info button
		if (this.oninfo)
		{	var div_oninfo = document.createElement("div");
					div_oninfo.classList.add("layerInfo")
					div_oninfo.setAttribute("title", this.tip.info)
					div_oninfo.addEventListener('click', onInfo);
					layer_buttons.appendChild(div_oninfo);
		}
		// Layer remove
		if (this.hastrash && !layer.get("noSwitcherDelete"))
		{	div_layer_remove = document.createElement("div");
			div_layer_remove.classList.add("layerTrash");
			div_layer_remove.setAttribute("title", this.tip.trash)
			div_layer_remove.addEventListener('click', removeLayer);
			layer_buttons.appendChild(div_layer_remove);
		}
		// Layer extent
		if (this.hasextent && layers[i].getExtent())
		{	var ex = layers[i].getExtent();
			if (ex.length==4 && ex[0]<ex[2] && ex[1]<ex[3])
			{	div_layer_extent = document.createElement("div");
				div_layer_extent.classList.add("layerExtent");
				div_layer_extent.setAttribute("title", this.tip.extent)
				div_layer_extent.addEventListener('click', zoomExtent);
				layer_buttons.appendChild(div_layer_extent);
			}
		}

		// Progress
		if (this.show_progress && layer instanceof ol_layer_Tile)
		{	var p = document.createElement("div");
					p.classList.add("layerswitcher-progress");
				d.appendChild(p);
			this.setprogress_(layer);
			layer.layerswitcher_progress = document.createElement("div")
			p.appendChild(layer.layerswitcher_progress);
		}

		// Opacity
		var opacity = document.createElement("div");
				opacity.classList.add("layerswitcher-opacity");
				opacity.addEventListener("click", function(e)
				{	e.stopPropagation();
					e.preventDefault();
					var x = e.pageX
						|| (e.touches && e.touches.length && e.touches[0].pageX)
						|| (e.changedTouches && e.changedTouches.length && e.changedTouches[0].pageX);
					var offset_left = this.getBoundingClientRect().left + window.pageXOffset - document.documentElement.clientLeft;
					var dx = Math.max ( 0, Math.min( 1, (x - offset_left) / this.clientWidth ));
					this.closest("li").dataLayer.setOpacity(dx);
				})
				d.appendChild(opacity);
		var div_opacity_cursor = document.createElement("div");
				div_opacity_cursor.classList.add("layerswitcher-opacity-cursor");
				div_opacity_cursor.addEventListener("mousedown", self.dragOpacity_.bind({ self: this }));
				div_opacity_cursor.addEventListener("touchstart", self.dragOpacity_.bind({ self: this }));
				div_opacity_cursor.style.left = (layer.getOpacity()*100)+"%";
				opacity.appendChild(div_opacity_cursor);
		// Percent
		var div_opacity_label = document.createElement("div");
				div_opacity_label.classList.add("layerswitcher-opacity-label")
				div_opacity_label.textContent = Math.round(layer.getOpacity()*100);
				d.appendChild(div_opacity_label);

		// Layer group
		if (layer.getLayers)
		{	li.classList.add('ol-layer-group');
			if (layer.get("openInLayerSwitcher")===true)
			{	this.drawList (li.appendChild(document.createElement("ul")), layer.getLayers());
			}
		}
		else if (layer instanceof ol_layer_Vector) li.classList.add('ol-layer-vector');
		else if (layer instanceof ol_layer_VectorTile) li.classList.add('ol-layer-vector');
		else if (layer instanceof ol_layer_Tile) li.classList.add('ol-layer-tile');
		else if (layer instanceof ol_layer_Image) li.classList.add('ol-layer-image');
		else if (layer instanceof ol_layer_Heatmap) li.classList.add('ol-layer-heatmap');


		// Dispatch a draglist event to allow customisation
		this.dispatchEvent({ type:'drawlist', layer:layer, li:li });
	}

	this.viewChange();

	if (ul==this.panel_) this.overflow();
};

/** Handle progress bar for a layer
*	@private
*/
ol_control_LayerSwitcher.prototype.setprogress_ = function(layer)
{
	if (!layer.layerswitcher_progress)
	{	var loaded = 0;
		var loading = 0;
		function draw()
		{	if (loading === loaded)
			{	loading = loaded = 0;
				layer.layerswitcher_progress.style.width = 0;
			}
			else
			{	layer.layerswitcher_progress.style.width = (loaded / loading * 100).toFixed(1) + '%';
			}
		}
		layer.getSource().on('tileloadstart', function()
		{	loading++;
			draw();
		});
		layer.getSource().on('tileloadend', function()
		{	loaded++;
			draw();
		});
		layer.getSource().on('tileloaderror', function()
		{	loaded++;
			draw();
		});
	}
};

export default ol_control_LayerSwitcher
