/*global WebKitCSSMatrix:false, define:false */
/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, evil:true, 
    laxbreak:true, bitwise:true, strict:true, undef:true, unused:true, browser:true,
    jquery:true, indent:4, curly:false, maxerr:50 */

/*
 * Attempt to do what Raphael does with DOM elements, so it can be switched in
 * to speed up execution on mobile devices.
 * Only supports the basics and modern WebKit browsers.
 *
 * Dependent on jQuery (tested with 1.9.0)
 * TODO: remove dependency - not really necessary
 *
 * @author Mark Rhodes
 * @company ScottLogic Ltd.
 */

(function (factory) {
    "use strict";
    if (typeof define === 'function' && define.amd) {
        define(["jquery"], factory);
    } else {
        window.DOMRaphael = factory(jQuery);
    }
})(function ($) {
    "use strict";

    //Creates a new absolutely positioned jQuery obj using the given transform matrix and
    //optionally setting it dimensions to a 1px square..
    function createNewAbs$AtPos(transformMatrix, setDimensions) {
        return $("<div>").css({
            position: "absolute",
            top: "0px",
            left: "0px",
            width: setDimensions ? "1px" : "",
            height: setDimensions ? "1px" : "",
            webkitTransformOrigin: "0 0",
            webkitTransform: "" + transformMatrix
        });
    }
    
    //Calculates and returns the transform matrix of the given DOM element, which should be attached
    //to the DOM at the time of calculation.
    function calculateTransformMatrix(x, y, width, height) {
        width = typeof width === "undefined" ? 1 : width;
        height = typeof height === "undefined" ? 1 : height;
        return new WebKitCSSMatrix().translate(x, y).scale(width, height);
    }

    function bindToTransitionEndForSingleRun($el, funcToExec, maxMSTillTransitionEnd) {
    	var timeout, fired;
		var wrappedFunc = function () {
            if (fired) {
                return; //should not happen.
            }
            fired = true;
            $el.unbind('webkitTransitionEnd', wrappedFunc);
            clearTimeout(timeout);
            funcToExec();
		};
		$el.bind('webkitTransitionEnd', wrappedFunc);
		timeout = setTimeout(wrappedFunc, maxMSTillTransitionEnd + 200);
	}

    //Returns a new object which is the same as the original, but only contains the
    //allowed properties.
    function filter(obj, allowedProps) {
        var filtered = {};
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop) && allowedProps.indexOf(prop) !== -1) {
                filtered[prop] = obj[prop];
            }
        }
        return filtered;
    }

    //Each element has an unique id so that it can be tracked..
    var nextElemId = 1;
    
    //Regex to remove "px" at the end of values..
    var pxRegEx = /px$/;

    //Set of functions for all drawable elements..
    var elementFunctions = {

        //Getter/Setter for attributes - matches Raphael's function in terms of parameters..
        attr: function () {
            var arg0 = arguments[0];

            //single setter..
            if (arguments.length > 1) { 
                var props = {};
                props[arg0] = arguments[1];
                return this._CSSFromSVG(props, true);
            }
            if (typeof arg0 === "object") {
                //multi-getter..
                if (arg0 instanceof Array) {
                    return this._getSVGAttrs(arg0);
                } else {
                    //multi-setter..
                    return this._CSSFromSVG(arg0, true);
                }
            } 
            //single getter..
            return this._getSVGAttrs([arg0])[0];
        },
        
        //Removes this element from the DOM..
        remove: function () {
            this.$el.remove();
            this.canvas.elements.exclude(this);
        },

        //Note: currently a rather basic impl and will only transition properties
        //which are known to be hardware acceleratable..
        animate: function (attrs, ms, tween, onComplete) {
            var css = this._CSSFromSVG(attrs),
                filteredCss = filter(css, ["-webkit-transform", "opacity"]),
                $el = this.$el,
                elStyle = $el[0].style;
            
            var transitionStr = "";
            var first = true;
            $.each(filteredCss, function (prop) {
                transitionStr += (first ? "" : ", ") + prop + " " + ms + "ms " + tween; 
                first = false;
            });
            elStyle.webkitTransition = transitionStr;
            elStyle.webkitBackfaceVisibility = "hidden"; //attempt to switch to use hardware-rendering if not before..

            setTimeout(function () {
                //note: this little timeout hack is required for when the element is newly appended and
                //      you've not run window.getComputedStyle on it - in this case alterations to the
                //      transform matrix will not animate.
                $el.css(css); //trigger the transition..
            });
            bindToTransitionEndForSingleRun($el, function () {
                elStyle.webkitTransition = ""; //prevent further changes causing animation..
                if (onComplete) {
                    onComplete();
                }
            }, ms);

            return this;
        },
        
        //Returns the "bounding box" for this element..
        getBBox: function () {
            var attrs = this._getSVGAttrs(["x", "y", "width", "height"]),
                x = attrs[0],
                y = attrs[1],
                width = attrs[2],
                height = attrs[3];

            return {
                x: x,
                y: y,
                x2: x + width,
                y2: y + height,
                width: width,
                height: height
            };
        },
        
        //Stores the given data with this object..
        data: function (key, value) {
            var dataMap = this.dataMap;
            if (typeof value === "undefined") {
                return dataMap[key];
            }
            dataMap[key] = value;
            return this;
        },
        
        //Obtains an array of values for the requested SVG attributes.
        //Note: currently only supports pixel values.
        _getSVGAttrs: function (attrsToGet) {
            var attrs = [],
                $el = this.$el,
                transformMatrix = this.transformMatrix,
                self = this;
            
            attrsToGet.forEach(function (attr) {
                switch (attr) {
                case "x":
                    attrs.push(transformMatrix.e);
                    break;
                case "y":
                    attrs.push(transformMatrix.f);
                    break;
                case "width":
                    attrs.push(transformMatrix.a);
                    break;
                case "height":
                    attrs.push(transformMatrix.d);
                    break;
                case "fill":
                    attrs.push($el.css(self.type === "Text" ? "color" : "background-color"));
                    break;
                case "stroke-width":
                    attrs.push($el.css("border-width"));
                    break;
                default:
                    attrs.push($el.css(attr));
                }
            });
            
            return attrs;
        },
        
        //Converts the given map of SVG attributes to a map of CSS properties and returns it
        //unless setValues is true, in which case they are applied on this element and this returned.
        _CSSFromSVG: function (attrs, setValues) {
            var css = {},
                $el = this.$el,
                self = this,
                transformMatrix;
                
            function getTransformMatrix() {
                //clone a new copy if not done so..
                return transformMatrix = transformMatrix || new WebKitCSSMatrix(self.transformMatrix);
            }

            $.each(attrs, function (attr, value) {
                switch (attr) {
                case "x":
                    getTransformMatrix().e = value;
                    break;
                case "y":
                    getTransformMatrix().f = value;
                    break;
                case "width":
                    getTransformMatrix().a = value;
                    break;
                case "height":
                    getTransformMatrix().d = value;
                    break;
                case "fill":
                    css[self.type === "Text" ? "color" : "background-color"] = value;
                    break;
                case "stroke-width":
                    css["border-width"] = value;
                    break;
                case "opacity":
                    //don't allow zero as a valid value as it causes issues..
                    css.opacity = value === 0 ? 0.001 : value;
                    break;
                default:
                    css[attr] = value;
                }
            });

            if (transformMatrix) {
                css["-webkit-transform"] = "" + transformMatrix;
            }
            if (setValues) {
                $el.css(css);
                if (transformMatrix) {
                    this.transformMatrix = transformMatrix;
                }
                return this;
            }
            return css;
        }

    };

    //Text class constructor..
    var Text = function (canvas, x, y, text) {
        var transformMatrix = this.transformMatrix = calculateTransformMatrix(x, y);
        var $el = this.$el = createNewAbs$AtPos(transformMatrix, false);
        this.id = nextElemId++;
        this.canvas = canvas;
        this.type = "Text";
        this.dataMap = {};

        //Center text around point..
        var textHolder = $('<div>').text(text).css("webkit-transform", "translate(-50%, -50%)");
        $el.append(textHolder);

        canvas.$el.append($el);
        canvas.elements.push(this);
    };
    Text.prototype = $.extend({}, elementFunctions, {

        //need to recalc due to fact that top left isn't (x, y)..
        getBBox: function () {
            var bbox = elementFunctions.getBBox.apply(this, arguments),
                halfWidth = bbox.width / 2, halfHeight = bbox.height / 2;

            bbox.x -= halfWidth;
            bbox.x2 -= halfWidth;
            bbox.y -= halfHeight;
            bbox.y2 -= halfHeight;
            return bbox;
        },
        
        //Need to fix as width and height are not accurrate since scale is not important..
        _getSVGAttrs: function (attrsToGet) {
            var $el = this.$el,
                attrs = elementFunctions._getSVGAttrs.apply(this, arguments);

            ["width", "height"].forEach(function (prop) {
                var index = attrsToGet.indexOf(prop);
                if (index !== -1) {
                    attrs[index] = parseFloat($el.css(prop).replace(pxRegEx, ""), 10);
                }
            });
            return attrs;
        }
    });

    //Rectangle class contructor..
    var Rect = function (canvas, x, y, width, height) {
        var transformMatrix = this.transformMatrix = calculateTransformMatrix(x, y, width, height);
        var $el = this.$el = createNewAbs$AtPos(transformMatrix, true);
        this.id = nextElemId++;
        this.canvas = canvas;
        this.type = "Rect";
        this.dataMap = {};

        canvas.$el.append($el);
        canvas.elements.push(this);
    };
    Rect.prototype = elementFunctions;
 
    //Set class like Raphael's - for combining elements..
    var Set = function () {
        this.map = {};
    };
    Set.prototype = {

        //Calls the given function on each element of this set..
        forEach: function (fnToCall) {
            $.each(this.map, function (elemId, elem) {
                fnToCall(elem);
            });
        },  
        
        //Adds the given element to this set..
        push: function (elem) {
            this.map[elem.id] = elem;
            return this;
        },
        
        exclude: function (elem) {
            var map = this.map,
                found = map[elem.id]; 
            delete map[elem.id];
            return !!found;
        }
    };

    //add all the element functions to set - return value off but never mind..
    $.each(elementFunctions, function (fnName, fn) {
        Set.prototype[fnName] = function () {
            var args = arguments;
            $.each(this.map, function (elemId, elem) {
                fn.apply(elem, args);
            });
        };
    });

    //Constructor for the canvas class which makes use of the given DOM element..
    var Canvas = function (el, width, height) {
        var $el = this.$el = $(el);
        this.elements = new Set(); 

        $el.css({
            position: "relative",
            width: width + "px",
            height: height + "px",
            overflow: "hidden"
        });
    };
    Canvas.prototype = {
    
        //Executes the given given for each element of this canvas..
        forEach: function (fnToCall) {
            this.elements.forEach(fnToCall);
        },

        //Returns a new element which has the given text, centered around the given point..
        text: function (x, y, text) {
            return new Text(this, x, y, text);
        },

        rect: function (x, y, width, height) {
            return new Rect(this, x, y, width, height);
        },
        
        set: function () {
            return new Set();
        }
    };

    //Constructs a new canvas using the given element..
    var DOMRaphael = function (el, width, height) {
        return new Canvas(el, width, height);
    };
    
    //Returns whether or not the given bounding boxes intersect..
    DOMRaphael.isBBoxIntersect = function (a, b) {
        //intersect x..
        if (a.x < b.x) {
            if (a.x2 <= b.x) {
                return false;
            }
        } else if (b.x2 <= a.x) {
            return false;
        }
        //intersect y..
        if (a.y < b.y) {
            if (a.y2 <= b.y) {
                return false;
            }
        } else if (b.y2 <= a.y) {
            return false;
        }
        return true;
    };
    
    return DOMRaphael;
});
