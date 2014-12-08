/**
 * @license @product.name@ JS v@product.version@ (@product.date@)
 *
 * (c) 2014 Highsoft AS
 * Authors: Jon Arild Nygard / Oystein Moseng
 *
 * License: www.highcharts.com/license
 */

/*global HighchartsAdapter */
(function (H) {
	var seriesTypes = H.seriesTypes,
		merge = H.merge,
		extendClass = H.extendClass,
		defaultOptions = H.getOptions(),
		plotOptions = defaultOptions.plotOptions,
		noop = function () { return; },
		each = H.each,
		Series = H.Series,
		Color = H.Color;

	// Define default options
	plotOptions.treemap = merge(plotOptions.scatter, {
		showInLegend: false,
		marker: false,
		borderColor: '#FFFFFF',
		borderWidth: 1,
		borderRadius: 0,
		radius: 0,
		dataLabels: {
			enabled: true,
			defer: false,
			verticalAlign: 'middle',
			formatter: function () { // #2945
				return this.point.name || this.point.id;
			},
			inside: true
		},
		tooltip: {
			headerFormat: '',
			pointFormat: 'name: <b>{point.name}</b><br/>value: <b>{point.value}</b><br/>'
		},
		layoutAlgorithm: 'sliceAndDice',
		directionalChange: false,
		states: {
			hover: {
				borderColor: '#000000',
				brightness: 0.1,
				shadow: false
			}
		},
		drillUpButton: {
			position: { 
				align: 'left',
				x: 10,
				y: -50
			}
		}
	});
	
	// Stolen from heatmap	
	var colorSeriesMixin = {
		// mapping between SVG attributes and the corresponding options
		pointAttrToOptions: { 
			stroke: 'borderColor',
			'stroke-width': 'borderWidth',
			fill: 'color',
			dashstyle: 'borderDashStyle',
			r: 'borderRadius'
		},
		pointArrayMap: ['value'],
		axisTypes: seriesTypes.heatmap ? ['xAxis', 'yAxis', 'colorAxis'] : ['xAxis', 'yAxis'],
		optionalAxis: 'colorAxis',
		getSymbol: noop,
		parallelArrays: ['x', 'y', 'value', 'colorValue'],
		colorKey: 'colorValue', // Point color option key
		translateColors: seriesTypes.heatmap && seriesTypes.heatmap.prototype.translateColors
	};

	// The Treemap series type
	seriesTypes.treemap = extendClass(seriesTypes.scatter, merge(colorSeriesMixin, {
		type: 'treemap',
		trackerGroups: ['group', 'dataLabelsGroup'],
		pointClass: extendClass(H.Point, {
			setState: function (state, move) {
				H.Point.prototype.setState.call(this, state, move);
				if (state === 'hover') {
					if (this.dataLabel) {
						this.dataLabel.attr({ zIndex: 1002 });
					}
				} else {
					if (this.dataLabel) {
						this.dataLabel.attr({ zIndex: (this.pointAttr[''].zIndex + 1) });
					}
				}
			}
		}),
		handleLayout: function () {
			var series = this,
				tree = this.tree,
				seriesArea;
			if (this.points.length) {
				// Assign variables
				if (!tree) {
					this.nodeMap = [];
					tree = this.tree = this.getTree();
				}
				if (!this.rootNode) {
					this.rootNode = "";
				}
				this.levelMap = this.getLevels();
				each(series.points, function (point) {
					// Reset visibility
					delete point.plotX;
					delete point.plotY;
				});
				seriesArea = this.getSeriesArea(tree.val);
				this.nodeMap[""].values = seriesArea;
				this.calculateArea(tree, seriesArea);
			}
		},
		/**
		* Creates a tree structured object from the series points
		*/
		getTree: function () {
			var tree,
				series = this,
				i = 0,
				parentList = [],
				allIds = [],
				key,
				insertItem = function (key) {
					each(parentList[key], function (item) {
						parentList[""].push(item);
					});
				},
				getNodeTree = function (id, i, level, list, points, parent) {
					var children = [],
						sortedChildren = [],
						val = 0,
						point = points[i],
						nodeTree,
						node,
						insertNode,
						name;
					insertNode = function () {
						var i = 0,
							inserted = false;
						if (sortedChildren.length !== 0) {
							each(sortedChildren, function (child) {
								if (node.val > child.val && !inserted) {
									sortedChildren.splice(i, 0, node);
									inserted = true;
								}
								i = i + 1;					
							});
						} 
						if (!inserted) {
							sortedChildren.push(node);
						}
					};

					// Actions
					if (point) {
						name = point.name || "";
					}
					if (list[id] !== undefined) {
						each(list[id], function (i) {
							node = getNodeTree(points[i].id, i, (level + 1), list, points, id);
							val += node.val;
							insertNode();
							children.push(node);
						});
					} else {
						val = points[i].value;
						if (val === undefined) {
							val = 0;
						}
					}
					nodeTree = {
						id: id,
						i: i,
						children: sortedChildren,
						val: val,
						level: level,
						parent: parent,
						name: name
					};
					series.nodeMap[nodeTree.id] = nodeTree;
					return nodeTree;
				};
			// Actions
			// Map children to index
			each(this.points, function (point) {
				var parent = "";
				allIds.push(point.id);
				if (point.parent !== undefined) {
					parent = point.parent;
				}
				if (parentList[parent] === undefined) {
					parentList[parent] = [];
				}
				parentList[parent].push(i);
				i = i + 1;
			});
			/* 
			*  Quality check:
			*  - If parent does not exist, then set parent to tree root
			*  - Add node id to parents children list
			*/  
			for (key in parentList) {
				if (parentList.hasOwnProperty(key)) {
					if (key !== "") {
						if (HighchartsAdapter.inArray(key, allIds) === -1) {
							insertItem(key);
							delete parentList[key];
						}
					}
				}
			}
			tree = getNodeTree("", -1, 0, parentList, this.points, null);
			return tree;
		},
		calculateArea: function (node, area) {
			var childrenValues = [],
				childValues,
				series = this,
				options = series.options,
				xAxis = series.xAxis,
				yAxis = series.yAxis,				
				algorithm = options.layoutAlgorithm,
				directionalChange = options.directionalChange,
				levelRoot = this.nodeMap[this.rootNode].level,							
				i = 0,
				level,
				point,
				x1,
				x2,
				y1,
				y2,
				setPointValues = function (node, values, isLeaf) {
						node.values = values;
						point = series.points[node.i];
						x1 = Math.round(xAxis.translate(values.x, 0, 0, 0, 1));
						x2 = Math.round(xAxis.translate(values.x + values.width, 0, 0, 0, 1));
						y1 = Math.round(yAxis.translate(values.y, 0, 0, 0, 1));
						y2 = Math.round(yAxis.translate(values.y + values.height, 0, 0, 0, 1));
					if (node.val > 0) {
						point = series.points[node.i];
						point.isLeaf = isLeaf;
						point.value = node.val;
						// Set point values
						point.shapeType = 'rect';
						point.shapeArgs = {
							x: Math.min(x1, x2),
							y: Math.min(y1, y2),
							width: Math.abs(x2 - x1),
							height: Math.abs(y2 - y1)
						};
						point.plotX = point.shapeArgs.x + (point.shapeArgs.width / 2);
						point.plotY = point.shapeArgs.y + (point.shapeArgs.height / 2);
					}
				};
			// If layoutAlgorithm is set for the level of the children, then default is overwritten
			if (this.levelMap[node.level - levelRoot + 1]) {
				level = this.levelMap[node.level - levelRoot + 1];
				if (level.layoutAlgorithm && series[level.layoutAlgorithm]) {
					algorithm = level.layoutAlgorithm;
				}
			}
			childrenValues = series[algorithm](area, node.children);
			each(node.children, function (child) {
				point = series.points[child.i];
				point.level = child.level - levelRoot;
				childValues = childrenValues[i];
				childValues.val = child.val;
				childValues.direction = area.direction;
				if (directionalChange) {
					childValues.direction = 1 - childValues.direction;
				}
				// If node has children, then call method recursively
				if (child.children.length) {
					setPointValues(child, childValues, false);
					series.calculateArea(child, childValues);
				} else {
					setPointValues(child, childValues, true);
				}
				i = i + 1;
			});
		},
		getSeriesArea: function (val) {
			var w = this.xAxis.options.dataMax,
				x = this.xAxis.options.dataMin,
				y = this.yAxis.options.dataMin,
				h = this.yAxis.options.dataMax,
				seriesArea = {
					x: x,
					y: y,
					width: w,
					height: h,
					direction: 0,
					val: val
				};
			return seriesArea;
		},
		getLevels: function () {
			var map = [],
				levels = this.options.levels;
			if (levels) {
				each(levels, function (level) {
					if (level.level !== undefined) {
						map[level.level] = level;
					}
				});
			}
			return map;
		},
		setColorRecursive: function (node, color) {
			var series = this,
				point,
				level;
			if (node) {
				point = series.points[node.i];
				// Overwrite color if level specific color is set
				if (this.levelMap[node.level] !== undefined) {
					level = this.levelMap[node.level];
					if (level.color !== undefined) {
						color = level.color;
					}
				}
				// If point color is not set, then give it inherited or level color
				if (node.i !== -1) {
					if (point.color === undefined) {
						if (color !== undefined) {
							point.color = color;
							point.options.color = color;
						}
					} else {
						color = point.color;
					}
				}
				// Do it all again with the children	
				if (node.children.length) {
					each(node.children, function (child) {
						series.setColorRecursive(child, color);
					});
				}
			}
		},
		alg_func_group: function (h, w, d, p) {
			this.height = h;
			this.width = w;
			this.plot = p;
			this.direction = d;
			this.startDirection = d;
			this.total = 0;
			this.nW = 0;
			this.lW = 0;
			this.nH = 0;
			this.lH = 0;
			this.elArr = [];
			this.lP = {
				total: 0,
				lH: 0,
				nH: 0,
				lW: 0,
				nW: 0,
				nR: 0,
				lR: 0,
				aspectRatio: function (w, h) {
					return Math.max((w / h), (h / w));
				}
			};
			this.addElement = function (el) {
				this.lP.total = this.elArr[this.elArr.length - 1];
				this.total = this.total + el;
				if (this.direction === 0) {
					// Calculate last point old aspect ratio
					this.lW = this.nW;
					this.lP.lH = this.lP.total / this.lW;
					this.lP.lR = this.lP.aspectRatio(this.lW, this.lP.lH);
					// Calculate last point new aspect ratio
					this.nW = this.total / this.height;
					this.lP.nH = this.lP.total / this.nW;
					this.lP.nR = this.lP.aspectRatio(this.nW, this.lP.nH);
				} else {
					// Calculate last point old aspect ratio
					this.lH = this.nH;
					this.lP.lW = this.lP.total / this.lH;
					this.lP.lR = this.lP.aspectRatio(this.lP.lW, this.lH);
					// Calculate last point new aspect ratio
					this.nH = this.total / this.width;
					this.lP.nW = this.lP.total / this.nH;
					this.lP.nR = this.lP.aspectRatio(this.lP.nW, this.nH);
				}
				this.elArr.push(el);						
			};
			this.reset = function () {
				this.nW = 0;
				this.lW = 0;
				this.elArr = [];
				this.total = 0;
			};
		},
		alg_func_calcPoints: function (directionChange, last, group, childrenArea) {
			var pX,
				pY,
				pW,
				pH,
				gW = group.lW,
				gH = group.lH,
				plot = group.plot,
				keep,
				i = 0,
				end = group.elArr.length - 1;
			if (last) {
				gW = group.nW;
				gH = group.nH;
			} else {
				keep = group.elArr[group.elArr.length - 1];
			}
			each(group.elArr, function (p) {
				if (last || (i < end)) {
					if (group.direction === 0) {
						pX = plot.x;
						pY = plot.y; 
						pW = gW;
						pH = p / pW;
					} else {
						pX = plot.x;
						pY = plot.y;
						pH = gH;
						pW = p / pH;
					}
					childrenArea.push({
						x: pX,
						y: pY,
						width: pW,
						height: pH
					});
					if (group.direction === 0) {
						plot.y = plot.y + pH;
					} else {
						plot.x = plot.x + pW;
					}						
				}
				i = i + 1;
			});
			// Reset variables
			group.reset();
			if (group.direction === 0) {
				group.width = group.width - gW;
			} else {
				group.height = group.height - gH;
			}
			plot.y = plot.parent.y + (plot.parent.height - group.height);
			plot.x = plot.parent.x + (plot.parent.width - group.width);
			if (directionChange) {
				group.direction = 1 - group.direction;
			}
			// If not last, then add uncalculated element
			if (!last) {
				group.addElement(keep);
			}
		},
		alg_func_lowAspectRatio: function (directionChange, parent, children) {
			var childrenArea = [],
				series = this,
				pTot,
				plot = {
					x: parent.x,
					y: parent.y,
					parent: parent
				},
				direction = parent.direction,
				i = 0,
				end = children.length - 1,
				group = new this.alg_func_group(parent.height, parent.width, direction, plot);
			// Loop through and calculate all areas
			each(children, function (child) {
				pTot = (parent.width * parent.height) * (child.val / parent.val);
				group.addElement(pTot);
				if (group.lP.nR > group.lP.lR) {
					series.alg_func_calcPoints(directionChange, false, group, childrenArea, plot);
				}
				// If last child, then calculate all remaining areas
				if (i === end) {
					series.alg_func_calcPoints(directionChange, true, group, childrenArea, plot);
				}
				i = i + 1;
			});
			return childrenArea;
		},
		alg_func_fill: function (directionChange, parent, children) {
			var childrenArea = [],
				pTot,
				direction = parent.direction,
				x = parent.x,
				y = parent.y,
				width = parent.width,
				height = parent.height,
				pX,
				pY,
				pW,
				pH;
			each(children, function (child) {
				pTot = (parent.width * parent.height) * (child.val / parent.val);
				pX = x;
				pY = y;
				if (direction === 0) {
					pH = height;
					pW = pTot / pH;
					width = width - pW;
					x = x + pW;
				} else {
					pW = width;
					pH = pTot / pW;
					height = height - pH;
					y = y + pH;
				}
				childrenArea.push({
					x: pX,
					y: pY,
					width: pW,
					height: pH
				});
				if (directionChange) {
					direction = 1 - direction;
				}
			});
			return childrenArea;
		},
		strip: function (parent, children) {
			return this.alg_func_lowAspectRatio(false, parent, children);
		},
		squarified: function (parent, children) {
			return this.alg_func_lowAspectRatio(true, parent, children);
		},
		sliceAndDice: function (parent, children) {
			return this.alg_func_fill(true, parent, children);
		},
		stripes: function (parent, children) {
			return this.alg_func_fill(false, parent, children);
		},
		translate: function () {
			// Call prototype function
			Series.prototype.translate.call(this);
			this.handleLayout();

			// If a colorAxis is defined
			if (this.colorAxis) {
				this.translateColors();
			} else {
				this.setColorRecursive(this.tree, undefined);
			}
		},
		/**
		* Extend drawDataLabels with logic to handle the levels option
		*/
		drawDataLabels: function () {
			var series = this,
				points = series.points,
				options,
				level,
				dataLabelsGroup = this.dataLabelsGroup,
				dataLabels;
			each(points, function (point) {
				level = series.levelMap[point.level];
				if (!point.isLeaf || level) {
					options = undefined;
					// If not a leaf, then label should be disabled as default
					if (!point.isLeaf) {
						options = {enabled: false};
					}
					if (level) {
						dataLabels = level.dataLabels;
						if (dataLabels) {
							options = merge(options, dataLabels);
							series._hasPointLabels = true;
						}
					}
					options = merge(options, point.options.dataLabels);
					point.dlOptions = options;
				} else {
					delete point.dlOptions;
				}
			});
			this.dataLabelsGroup = this.group;
			Series.prototype.drawDataLabels.call(this);
			this.dataLabelsGroup = dataLabelsGroup;
		},
		/**
		* If the dataLabel need more space than the point shape, then remove it.
		*/
		alignDataLabel: function (point, dataLabel) {
			var bBox,
				shapeArgs = point.shapeArgs;
			seriesTypes.column.prototype.alignDataLabel.apply(this, [].slice.call(arguments));
			if (shapeArgs) {
			bBox = dataLabel.getBBox();
				if (bBox.height > shapeArgs.height || bBox.width > shapeArgs.width) {
					dataLabel.attr({ y: -999 });
					dataLabel.placed = false; // don't animate back in
				}
			}
		},
		/**
		* Extending ColumnSeries drawPoints
		*/
		drawPoints: function () {
			var series = this,
				points = series.points,
				seriesOptions = series.options,
				attr,
				hover,
				level;
			each(points, function (point) {
				level = series.levelMap[point.level];
				attr = {
					stroke: seriesOptions.borderColor,
					'stroke-width': seriesOptions.borderWidth,
					dashstyle: seriesOptions.borderDashStyle,
					r: 0, // borderRadius gives wrong size relations and should always be disabled
					fill: series.color
				};
				// Overwrite standard series options with level options			
				if (level) {
					attr.stroke = level.borderColor || attr.stroke;
					attr['stroke-width'] = level.borderWidth || attr['stroke-width'];
					attr.dashstyle = level.borderDashStyle || attr.dashstyle;
					attr.fill = level.color || attr.fill;
				}
				// Merge with point attributes
				attr.stroke = point.borderColor || attr.stroke;
				attr['stroke-width'] = point.borderWidth || attr['stroke-width'];
				attr.dashstyle = point.borderDashStyle || attr.dashstyle;
				attr.fill = point.color || attr.fill;
				attr.zIndex = (1000 - (point.level * 2));

				// Make a copy to prevent overwriting individual props
				point.pointAttr = merge(point.pointAttr);
				hover = point.pointAttr.hover;
				hover.zIndex = 1001;
				// If not a leaf, then remove fill
				if (!point.isLeaf) {
					if (seriesOptions.allowDrillToNode) {
						// TODO: let users set the opacity
						attr.fill = Color(point.color || attr.fill).setOpacity(0.15).get();
						hover.fill = Color(hover.fill || attr.fill).setOpacity(0.75).get();
					} else {
						attr.fill = 'none';
						delete hover.fill;
					}
				}
				if (point.level < 1) {
					attr.fill = 'none';
					attr.zIndex = 0;
					delete hover.fill;
				}
				point.pointAttr[''] = H.extend(point.pointAttr[''], attr);
				if (point.dataLabel) {
					point.dataLabel.attr({ zIndex: (point.pointAttr[''].zIndex + 1) });
				}
			});
			// Call standard drawPoints
			seriesTypes.column.prototype.drawPoints.call(this);

			each(points, function (point) {
				if (point.graphic) {
					point.graphic.attr(point.pointAttr['']);
				}
			});

			// Set click events on points 
			if (seriesOptions.allowDrillToNode) {
				series.drillCloser();
			}
		},
		/**
		* Add drilling on the suitable points
		* TODO: review and better naming
		*/
		drillCloser: function () {
			var series = this,
				points = series.points,
				nodeParent;
			each(points, function (point) {
				H.removeEvent(point, 'click');
				if (point.graphic) {
					point.graphic.css({ cursor: 'default' });
				}
				if (point.level === 1 && !point.isLeaf) {
					nodeParent = series.nodeMap[series.nodeMap[point.id].parent];
					if (point.graphic) {
						point.graphic.css({ cursor: 'pointer' });
					}
					H.addEvent(point, 'click', function () {
						// Remove hover
						point.setState('');
						series.drillToNode(point.id);
						series.showDrillUpButton(nodeParent.name || nodeParent.id);
					});
				}
			});
		},
		drillUp: function () {
			var drillPoint = null,
				node,
				parent;
			if (this.rootNode) {
				node = this.nodeMap[this.rootNode];
				if (node.parent !== null) {
					drillPoint = this.nodeMap[node.parent];
				} else {
					drillPoint = this.nodeMap[""];
				}
			}

			if (drillPoint !== null) {
				this.drillToNode(drillPoint.id);
				if (drillPoint.id === "") {
					this.drillUpButton = this.drillUpButton.destroy();
				} else {
					parent = this.nodeMap[drillPoint.parent];
					this.showDrillUpButton((parent.name || parent.id));
				}
			} 
		},
		drillToNode: function (id) {
			var node = this.nodeMap[id],
				val = node.values;
			this.rootNode = id;
			this.xAxis.setExtremes(val.x, val.x + val.width, false);
			this.yAxis.setExtremes(val.y, val.y + val.height, false);
			this.chart.redraw();
		},
		showDrillUpButton: function (name) {
			var series = this,
				backText = (name || '< Back'),
				buttonOptions = series.options.drillUpButton,
				attr,
				states;

			if (buttonOptions.text) {
				backText = buttonOptions.text;
			}
			if (!this.drillUpButton) {
				attr = buttonOptions.theme;
				states = attr && attr.states;
							
				this.drillUpButton = this.chart.renderer.button(
					backText,
					null,
					null,
					function () {
						series.drillUp(); 
					},
					attr, 
					states && states.hover,
					states && states.select
				)
				.attr({
					align: buttonOptions.position.align,
					zIndex: 9
				})
				.add()
				.align(buttonOptions.position, false, buttonOptions.relativeTo || 'plotBox');
			} else {
				this.drillUpButton.attr({
					text: backText
				})
				.align();
			}
		},
		drawLegendSymbol: H.LegendSymbolMixin.drawRectangle,
		getExtremes: function () {
			// Get the extremes from the value data
			Series.prototype.getExtremes.call(this, this.colorValueData);
			this.valueMin = this.dataMin;
			this.valueMax = this.dataMax;

			// Get the extremes from the y data
			Series.prototype.getExtremes.call(this);
		},
		bindAxes: function () {
			var treeAxis = {
				endOnTick: false,
				gridLineWidth: 0,
				lineWidth: 0,
				min: 0,
				dataMin: 0,
				minPadding: 0,
				max: 100,
				dataMax: 100,
				maxPadding: 0,
				startOnTick: false,
				title: null,
				tickPositions: []
			};
			Series.prototype.bindAxes.call(this);
			H.extend(this.xAxis.options, treeAxis);
			H.extend(this.yAxis.options, treeAxis);
		}
	}));
}(Highcharts));