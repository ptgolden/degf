"use strict";

var d3 = require('d3')
  , React = require('react')
  , embryos = require('../embryos.json')
  , cellNameMap = require('../cell_name_map.json')


module.exports = React.createClass({
  displayName: 'GeneHeatMap',

  propTypes: {
    focusedGene: React.PropTypes.string,
    cellGeneMeasures: React.PropTypes.object
  },

  getMeasures() {
    var { focusedGene, cellGeneMeasures } = this.props
      , ret = {}

    Object.keys(cellGeneMeasures).forEach(cell => {
      ret[cell] = cellGeneMeasures[cell][focusedGene];
    });

    return ret;
  },

  render () {
    var { focusedGene } = this.props
      , Embryo = require('./embryo.jsx')
      , measures = this.getMeasures()
      , scale
      , step

    scale = d3.scale.linear()
      .domain([0, d3.max(Object.keys(measures).map(d => measures[d].avg))])
      .range(['#fff', '#2566a8'])
      .nice(4)

    step = d3.max(scale.domain()) / 4

    return (
      <div className="flex flex-center">
        <div className="mr3">
          {
            [0, 1, 2, 3, 4].map(i =>
              <div key={`${focusedGene}-scale-${i}`}>
                <span style={{
                  display: 'inline-block',
                  width: 20,
                  height: 20,
                  backgroundColor: scale(i * step)
                }}> </span>
                <span>{ i * step }</span>
              </div>
            )
          }
        </div>
          {
            embryos.map((embryoData, i) =>
              <div className="flex-auto px1" key={`${focusedGene}-embryo-${i}`}>
                <Embryo
                  embryoData={embryoData}
                  extraCellAtrs={cellName => ({
                    className: undefined,
                    onClick: undefined,
                    stroke: '#999',
                    fill: scale(measures[cellNameMap[cellName]].avg),
                  })}
                  {...this.props} />
              </div>
            )
          }
      </div>
    )
  }

});
