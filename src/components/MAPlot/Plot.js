"use strict";

const h = require('react-hyperscript')
    , R = require('ramda')
    , d3 = require('d3')
    , React = require('react')
    , { connect  } = require('react-redux')
    , throttle = require('throttleit')
    , styled = require('styled-components').default
    , { getPlotBins, projectForView } = require('../../utils')
    , onResize = require('../util/Sized')
    , { Flex, Button } = require('rebass')
    , { MagnifyingGlass, Target, Reset } = require('../Icons')
    , Action = require('../../actions')

const PlotWrapper = styled.div`
.button-group {
  display: flex;
}

.button-group button {
  border-radius: 0;
}

.button-group button:last-of-type {
  border-radius: 0 4px 4px 0;
}

.button-group button:first-of-type {
  border-radius: 4px 0 0 4px;
}

.button-group button + button {
  margin-left: -1px;
}

[data-active] {
  position: relative;
}

[data-active]:focus {
  z-index: 1;
}

.bin-selected,
.bin-hovered {
  stroke: red;
  stroke-width: 2px;
}

[data-active="true"]::after {
  position: absolute;
  content: " ";
  left: 4px;
  right: 4px;
  height: 2px;
  background-color: hsl(205,35%,45%);
  bottom: -8px;
  border: 1px solid #eee;
  box-shadow: 0 0 0 1px #eee;
}

.help-text {
  position: absolute;
  left: ${props => props.padding.l + 16 }px;
  right: ${props => props.padding.r + 16 }px;
  top: ${props => props.padding.t + 8 }px;
  padding: .66rem;
  background-color: hsl(205,35%,85%);
  border: 1px solid hsl(205,35%,45%);
  text-align: center;
}
`

const padding = {
  l: 60,
  r: 20,
  t: 60,
  b: 60,
}

const TreatmentLabels = styled.div`
position: absolute;
left: ${padding.l - 26}px;
right: 172px;
white-space: nowrap;
padding-bottom: 9px;
padding-left: 26px;

&:hover {
  z-index: 2;
  background-color: hsla(45,31%,93%,1);
  padding-right: 1em;
  overflow: unset;
  right: unset;
}

> div {
  font-family: SourceSansPro;
  font-weight: bold;
  font-size: 20px;

  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

> div:hover {
  width: unset;
  overflow:  unset;
  text-overflow:  unset;
}

> span {
  position: absolute;
  left: 0;
  top: 28px;
  font-family: SourceSansPro;
  font-weight: bold;
  font-size: 16px;
  color: #888;
}
`

const GRID_SQUARE_UNIT = 8

const TRANSCRIPT_BIN_MULTIPLIERS = {
  1: .35,
  2: .5,
  3: .65,
  4: .8,
}

const help = {
  zoom: 'Use mouse/touchscreen to zoom and pan',
  select: 'Use mouse to select squares on the plot',
  drag: 'Use mouse/touchscreen to select an area on the plot',
  reset: 'Reset position of the plot',
}

class Plot extends React.Component {
  constructor() {
    super();

    this.state = {
      xScale: null,
      yScale: null,
      dragAction: 'drag',
      showHelp: null,
      transform: d3.zoomIdentity,
    }
    this.drawAxes = this.drawAxes.bind(this)
  }

  static getDerivedStateFromProps(props, state) {
    const update = (
      props.width != null &&
      props.height != null &&
      props.width !== state.width &&
      props.height !== state.height
    )

    if (update) {
      const plotHeight = props.height - padding.t - padding.b
          , plotWidth = props.width - padding.l - padding.r

      const [ xDomain, yDomain ] = props.abundanceLimits

      const xScale = d3.scaleLinear()
        .domain(xDomain)
        .range([0, plotWidth])

      const yScale = d3.scaleLinear()
          .domain(yDomain)
          .range([plotHeight, 0])

      return {
        height: props.height,
        width: props.width,
        plotHeight,
        plotWidth,
        xScale: state.transform.rescaleX(xScale),
        yScale: state.transform.rescaleY(yScale),
        _xScale: xScale,
        _yScale: yScale,
      }
    }

    return null
  }

  componentDidUpdate(prevProps, prevState) {
    const propChanged = lens =>
      R.view(lens, this.props) !== R.view(lens, prevProps)

    const stateChanged = lens =>
      R.view(lens, this.state) !== R.view(lens, prevState)

    const hasDimensions = (
      this.props.height != null && this.props.width != null
    )

    if (!hasDimensions) return

    const dimensionsChanged = (
      propChanged(R.lensProp('height')) ||
      propChanged(R.lensProp('width'))
    )

    const scalesChanged = (
      stateChanged(R.lensProp('xScale')) ||
      stateChanged(R.lensProp('yScale'))
    )

    const redrawBins = (
      scalesChanged ||
      dimensionsChanged ||
      propChanged(R.lensProp('pairwiseData')) ||
      propChanged(R.lensProp('pValueThreshold'))
    )

    const resetInteraction = (
      !this.clearBrush ||
      dimensionsChanged ||
      stateChanged(R.lensProp('dragAction'))
    )

    const redrawAxes = (
      scalesChanged ||
      dimensionsChanged
    )

    const mustSetBrush = (
      this.state.dragAction === 'drag' &&
      propChanged(R.lensProp('brushedArea'))
    )

    if (resetInteraction) {
      this.initInteractionLayer()
    }

    if (mustSetBrush) {
      this.setBrushCoords(this.props.brushedArea)
    }

    if (redrawBins) {
      this.resetSelectedBin()
      this.drawBins()
      this.drawSavedTranscripts()
    }

    if (redrawAxes) {
      this.drawAxes()
    }

    if (propChanged(R.lensProp('hoveredTranscript'))) {
      this.updateHoveredTranscript()
    }

    if (propChanged(R.lensProp('savedTranscripts'))) {
      this.drawSavedTranscripts()
    }

  }

  initInteractionLayer() {
    const { updateOpts, dispatch } = this.props
        , { dragAction } = this.state

    if (!this.i) {
      this.i = 0
    }

    d3.select('.interaction')
      .selectAll('*').remove()

    dispatch(Action.SetHoveredBinTranscripts(null))
    dispatch(Action.SetSelectedBinTranscripts(null))

    if (dragAction === 'drag') {
      this.initBrush()
    } else if (dragAction === 'zoom') {
      this.clearBrush()
      this.initZoom()
      updateOpts(R.omit(['brushed']))
    }
  }

  initZoom() {
    const { plotWidth, plotHeight, xScale, yScale } = this.state

    const el = d3.select('.interaction')
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', plotWidth)
      .attr('height', plotHeight)
      .attr('fill', 'blue')
      .attr('opacity', 0)

    const zoom = d3.zoom()
      .on('zoom', () => {
        const transform = d3.event.transform

        this.setState({
          transform,
          xScale: transform.rescaleX(xScale),
          yScale: transform.rescaleY(yScale),
        })
      })

    el.call(zoom)
  }

  initBrush() {
    const { updateOpts } = this.props
        , { xScale, yScale, dragAction } = this.state

    if (!xScale) return
    const [ x0, x1 ] = xScale.domain().map(xScale)
    const [ y0, y1 ] = yScale.domain().map(yScale)

    const setBrush = throttle(extent => {
      const cpmBounds = extent.map(R.head).map(xScale.invert)
          , fcBounds = extent.map(R.last).map(yScale.invert)

      const coords = [
        cpmBounds[0],
        fcBounds[0],
        cpmBounds[1],
        fcBounds[1],
      ].map(n => n.toFixed(3)).map(parseFloat)

      this.props.dispatch(Action.SetBrushedArea(coords))
    }, 120)

    const brush = this.brush = d3.brush()
      .extent([[x0, y1], [x1, y0]])
      .on('brush', () => {
        if (!d3.event.sourceEvent) return
        if (!d3.event.selection) return

        const extent = d3.event.selection

        setBrush(extent)
      })
      .on('start', () => {
        this.binSelection
          .attr('stroke', 'none')
          .attr('class', '')

        this.props.dispatch(Action.SetHoveredBinTranscripts(null))
        this.props.dispatch(Action.SetSelectedBinTranscripts(null))
      })
      .on('end', () => {
        if (!d3.event.sourceEvent) return
        if (!this.binSelection) return

        // Reset each bin to its original fill
        this.binSelection.attr('fill', d => d.color)

        if (!d3.event.selection) {
          this.brushed = false;
          updateOpts(R.omit(['brushed']))
          if (dragAction === 'zoom') {
            this.initZoom()
          }
          return
        }

        this.brushed = true

        const extent = d3.event.selection
            , cpmBounds = extent.map(R.head).map(xScale.invert)
            , fcBounds = extent.map(R.last).map(yScale.invert)

        const coords = [
          cpmBounds[0],
          fcBounds[0],
          cpmBounds[1],
          fcBounds[1],
        ].map(n => n.toFixed(3)).map(parseFloat)

        setBrush(extent)

        updateOpts(opts => Object.assign({}, opts, { brushed: coords.join(',') }))
      })

    const brushSel = d3.select(this.plotG)
      .select('.interaction')
      .append('g')

    brushSel.call(brush)

    const that = this

    brushSel.select('rect')
      .on('mousemove', function () {
        if (that.brushed) return
        const [ x, y ] = d3.mouse(this)

        const inBin = that.binSelection.filter(({ x0, x1, y0, y1 }) => {
          return (
            (x >= x0 && x < x1) &&
            (y >= y1 && y < y0)
          )
        })

        const hoveredBin = inBin.size() ? inBin.datum() : null

        if (hoveredBin !== this._hoveredBin) {
          that.binSelection.attr('stroke', 'none')

          if (hoveredBin) {
            inBin.attr('stroke', 'red')
            that.props.dispatch(Action.SetHoveredBinTranscripts(new Set(
              hoveredBin.transcripts.map(t => t.name)
            )))
          } else {
            that.props.dispatch(Action.SetHoveredBinTranscripts(null))
          }

          this._hoveredBin = hoveredBin
          this._hoveredBinSelection = inBin
        }
      })
      .on('click', function () {
        if (d3.event.defaultPrevented) return

        that.binSelection.attr('class', '')

        if (this._hoveredBin) {
          const el = this._hoveredBinSelection.node()
          el.parentNode.appendChild(el)
          el.classList.add('bin-selected')

          that.props.dispatch(Action.SetSelectedBinTranscripts(new Set(
            this._hoveredBin.transcripts.map(t => t.name)
          )))
        }
      })

    this.clearBrush = () => brushSel.call(brush.move, null)
    this.setBrushCoords = coords => {
      if (coords == null) {
        this.clearBrush()
        return
      }

      const [ x0, y0, x1, y1 ] = coords

      brush.move(brushSel, [
        [xScale(x0), yScale(y0)],
        [xScale(x1), yScale(y1)],
      ])
    }
  }

  resetSelectedBin() {
    const { dispatch } = this.props

    dispatch(Action.SetSelectedBinTranscripts(null))

    ;[...this.svg.querySelectorAll('.bin-selected')].forEach(el => {
      el.classList.remove('bin-selected')
    })
  }

  drawAxes() {
    const { xScale, yScale } = this.state

    const xEl = d3.select(this.svg)
      .select('.x-axis')

    xEl.selectAll('*').remove()

    xEl.call(d3.axisBottom().scale(xScale))

    const yEl = d3.select(this.svg)
      .select('.y-axis')

    yEl.selectAll('*').remove()

    yEl.call(d3.axisLeft().scale(yScale));

    yScale.ticks().forEach(y => {
      yEl.append('line')
        .attr('x1', Math.ceil(xScale(xScale.domain()[0])))
        .attr('x2', Math.ceil(xScale(xScale.domain()[1])))
        .attr('y1', Math.ceil(yScale(y)))
        .attr('y2', Math.ceil(yScale(y)))
        .attr('stroke', '#eee')
        .attr('stroke-width', 1)
    });

    xScale.ticks().forEach(x => {
      yEl.append('line')
        .attr('x1', Math.ceil(xScale(x)))
        .attr('x2', Math.ceil(xScale(x)))
        .attr('y1', Math.ceil(yScale(yScale.domain()[0])))
        .attr('y2', Math.ceil(yScale(yScale.domain()[1])))
        .attr('stroke', '#eee')
        .attr('stroke-width', 1)
    })
  }

  drawBins() {
    const { xScale, yScale } = this.state
        , { loading, pairwiseData, pValueThreshold } = this.props

    this.binSelection = null;

    d3.select(this.svg)
      .select('.squares > g')
      .remove()

    if (loading) return;

    if (pairwiseData === null) {
      d3.select('.squares')
        .append('g')
        .append('text')
        .attr('x', xScale(d3.mean(xScale.domain())))
        .attr('y', yScale(d3.mean(yScale.domain())))
        .text('No data available for comparison')
        .style('text-anchor', 'middle')

      return;
    }

    const bins = getPlotBins(
      pairwiseData,
      ({ pValue }) => pValue <= pValueThreshold,
      xScale,
      yScale,
      8)

    this.bins = bins

    const colorScale = d3.scaleSequential(d3.interpolateBlues)
      .domain([-300,150])

    const brushedColorScale = d3.scaleSequential(d3.interpolatePurples)
      .domain([-500,150])

    bins.forEach(bin => {
      if (!bin.transcripts.length) return
      bin.multiplier = TRANSCRIPT_BIN_MULTIPLIERS[bin.transcripts.length] || 1
      if (bin.transcripts.length < 5) {
        bin.color = colorScale(5)
        bin.brushedColor = brushedColorScale(5)
      } else if (bin.transcripts.length >= 150) {
        bin.color = colorScale(150)
        bin.brushedColor = brushedColorScale(150)
      } else {
        bin.color = colorScale(bin.transcripts.length)
        bin.brushedColor = brushedColorScale(bin.transcripts.length)
      }
    })

    this.binSelection = d3.select(this.svg)
      .select('.squares')
      .append('g')
      .selectAll('rect')
      .data(bins.filter(b => b.transcripts.length)).enter()
        .append('rect')
        .attr('x', d => d.x0 + (1 - d.multiplier) / 2 * GRID_SQUARE_UNIT)
        .attr('y', d => d.y1 + (1 - d.multiplier) / 2 * GRID_SQUARE_UNIT)
        .attr('width', d => GRID_SQUARE_UNIT * d.multiplier)
        .attr('height', d => GRID_SQUARE_UNIT * d.multiplier)
        .attr('fill', d => d.color)

    d3.select('defs').selectAll('*').remove()

    d3.select('defs')
      .append('clipPath')
      .attr('id', 'visible-plot')
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', xScale.range()[1])
      .attr('height', yScale.range()[0])

  }

  drawSavedTranscripts() {
    const { xScale, yScale } = this.state
        , { savedTranscripts, pairwiseData } = this.props

    if (!pairwiseData) return

    d3.select(this.svg)
      .select('.saved-transcripts')
      .selectAll('circle')
        .remove()

    d3.select(this.svg)
      .select('.saved-transcripts')
      .selectAll('circle')
      .data([...savedTranscripts].filter(x => pairwiseData.has(x)))
          .enter()
        .append('circle')
        .attr('cx', d => xScale(pairwiseData.get(d).logATA))
        .attr('cy', d => yScale(pairwiseData.get(d).logFC))
        .attr('r', 2)
        .attr('fill', 'red')

  }

  updateHoveredTranscript() {
    const { xScale, yScale } = this.state
        , { hoveredTranscript, pairwiseData } = this.props

    const container = d3.select(this.svg).select('.hovered-marker')

    container.selectAll('circle')
      .transition()
      .duration(360)
      .ease(d3.easeCubicOut)
      .style('opacity', 0)
      .remove()

    if (hoveredTranscript === null) return;
    if (pairwiseData === null) return;

    const data = pairwiseData.get(hoveredTranscript)

    if (!data) return

    const { logATA, logFC } = data

    container.append('circle')
      .attr('cx', xScale(logATA))
      .attr('cy', yScale(logFC))
      .attr('r', 20)
      .attr('opacity', 1)
      .attr('fill', 'none')
      .attr('stroke', 'coral')
      .attr('stroke-width', 2)

    container.append('circle')
      .attr('cx', xScale(logATA))
      .attr('cy', yScale(logFC))
      .attr('opacity', 1)
      .attr('r', 3)
      .attr('fill', 'coral')
  }

  render() {
    const {
      height,
      width,
      plotHeight,
      plotWidth,
      dragAction,
      showHelp,
      _xScale,
      _yScale,
    } = this.state

    const {
      dispatch,
      updateOpts,
      treatmentA,
      treatmentB,
      treatmentALabel,
      treatmentBLabel,
    } = this.props

    if (this.props.width == null) {
      return null
    }

    return (
      h(PlotWrapper, {
        padding,
        style: {
          height: '100%',
          width: '100%',
          position: 'relative',
        },
      }, [
        showHelp == null ? null : (
          h('p.help-text', help[showHelp])
        ),

        h(TreatmentLabels, {
        }, [
          h('div', {
            onMouseLeave() {
              dispatch(Action.SetHoveredTreatment(null))
            },
            onMouseEnter() {
              dispatch(Action.SetHoveredTreatment(treatmentA))
            },
          }, treatmentALabel),
          h('span', {
          }, 'vs.'),
          h('div', {
            onMouseLeave() {
              dispatch(Action.SetHoveredTreatment(null))
            },
            onMouseEnter() {
              dispatch(Action.SetHoveredTreatment(treatmentB))
            },
          }, treatmentBLabel),
        ]),

        h('div', {
          style: {
            position: 'absolute',
            right: padding.r,
            top: 6,
            width: 146,
            height: padding.t - 6,
            background: '#eee',
            border: '1px solid #ccc',
            borderRadius: '4px 4px 0 0',
            borderBottom: 'none',
          },
        }, [
          h(Flex, {
            className: 'toolbar',
            p: 2,
          }, [
            h('.button-group', [
              h(Button, {
                onClick: () => {
                  this.setState({ dragAction: 'drag' })
                },
                onMouseEnter: () => {
                  this.setState({ showHelp: 'drag' })
                },
                onMouseLeave: () => {
                  this.setState({ showHelp: null })
                },
                ['data-active']: dragAction === 'drag',
              }, h(Target)),
              h(Button, {
                onClick: () => {
                  this.setState({ dragAction: 'zoom' })
                },
                onMouseEnter: () => {
                  this.setState({ showHelp: 'zoom' })
                },
                onMouseLeave: () => {
                  this.setState({ showHelp: null })
                },
                ['data-active']: dragAction === 'zoom',
              }, h(MagnifyingGlass)),
            ]),
            h(Button, {
              ml: 1,
              onMouseEnter: () => {
                this.setState({ showHelp: 'reset' })
              },
              onMouseLeave: () => {
                this.setState({ showHelp: null })
              },
              onClick: () => {
                if (this.state.transform === d3.zoomIdentity) return

                this.clearBrush()
                updateOpts(R.omit(['brushed']))

                this.setState({
                  xScale: _xScale,
                  yScale: _yScale,
                  transform: d3.zoomIdentity,
                }, () => {
                  this.initInteractionLayer()
                })
              },
            }, h(Reset)),
          ]),
        ]),
        h('svg', {
          position: 'absolute',
          top: 0,
          bottom: 0,
          height: '100%',
          viewBox: `0 0 ${width} ${height}`,
          ref: el => { this.svg = el },
        }, [
          h('defs', [
          ]),

          // X Axis label
          h('text', {
            dx: padding.l,
            dy: padding.t,
            x: plotWidth / 2,
            y: plotHeight + (padding.b / 2) + 6, // extra pixels to bump it down from axis
            style: {
              fontWeight: 'bold',
              textAnchor: 'middle',
              dominantBaseline: 'central',
            },
          }, 'log₂ (Average Transcript Abundance)'),

          // Y Axis label
          h('text', {
            x: 0,
            y: (plotHeight / 2) + padding.t,
            transform: `
              rotate(-90, 0, ${plotHeight / 2 + padding.t})
              translate(0, ${padding.l / 2 - 6})
            `,
            style: {
              fontWeight: 'bold',
              textAnchor: 'middle',
              dominantBaseline: 'central',
            },
          }, 'log₂ (Fold Change)'),

          h('g', {
            ref: el => this.plotG = el,
            transform: `translate(${padding.l}, ${padding.t})`,
          }, [
            h('rect', {
              fill: '#f9f9f9',
              stroke: '#ccc',
              x: 0,
              y: 0,
              width: plotWidth,
              height: plotHeight,
            }),

            h('g.x-axis', {
              transform: `translate(0, ${plotHeight})`,
            }),
            h('g.y-axis'),

            h('g', { clipPath: 'url(#visible-plot)' }, [
              h('g.squares'),

              h('g.saved-transcripts'),

              h('g.interaction'),

              h('g.hovered-marker'),
            ]),
          ]),
        ]),
      ])
    )
  }
}

module.exports = R.pipe(
  connect(state => {
    const project = projectForView(state) || {}

    let treatmentALabel
      , treatmentBLabel
      , treatmentA
      , treatmentB

    {
      const { view } = state

      if (view) {
        const { comparedTreatments=[] } = view

        ;[ treatmentA, treatmentB ] = comparedTreatments

        ;[ treatmentALabel, treatmentBLabel ] = comparedTreatments
          .map(t => R.path(['treatments', t, 'label'], project) || t)

      }
    }

    return Object.assign({
      abundanceLimits: R.path(['config', 'abundanceLimits'], project),
      treatmentA,
      treatmentB,
      treatmentALabel,
      treatmentBLabel,
    }, R.pick([
      'loading',
      'brushedArea',
      'savedTranscripts',
      'pairwiseData',
      'pValueThreshold',
      'hoveredTranscript',
    ], state.view))
  }),
  onResize(el => ({
    width: el.clientWidth,
    height: el.clientHeight,
  }))
)(Plot)
