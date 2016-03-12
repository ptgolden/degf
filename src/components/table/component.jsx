"use strict";

var React = require('react')
  , consts = require('./consts')
  , Sorted = require('./sorted.jsx')
  , GeneTable


GeneTable = React.createClass({
  displayName: 'GeneTable',

  propTypes: {
    // height: React.PropTypes.integer.isRequired
  },

  render() {
    var TableBody = require('./table_body.jsx')
      , TableHeader = require('./table_header.jsx')

    return (
      <svg
          style={{ width: "100%", height: 'auto' }}
          width={consts.TABLE.WIDTH}
          height={consts.TABLE.HEIGHT}
          viewBox={`0 0 ${consts.TABLE.WIDTH} ${consts.TABLE.HEIGHT}`}>

        <rect
            x="0"
            y="0"
            width={consts.TABLE.WIDTH}
            height={consts.TABLE.HEIGHT}
            fill="#fff" />

        <TableHeader {...this.props} />

        <foreignObject
            x={0}
            y={consts.TABLE_HEADER.HEIGHT * 2}
            width={consts.TABLE.WIDTH}
            height={consts.TABLE_BODY.HEIGHT}>

          <div style={{
            minHeight: '100%',
            maxHeight: consts.TABLE_BODY.HEIGHT,
            overflowY: 'scroll',
            overflowX: 'hidden'
          }}>
            <table
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                fontSize: '12px',
                tableLayout: 'fixed'
              }}>

              <colgroup>
                { consts.TABLE.COLUMN_WIDTHS.map((width, i) => <col key={i} width={width} />) }
              </colgroup>

              <TableBody {...this.props} />
            </table>
          </div>
        </foreignObject>

        <g>
          {
            consts.TABLE.COLUMN_STARTS.filter((x, i) => [5, 7].indexOf(i) > -1).map((x, i) =>
              <line
                  key={i}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={consts.TABLE.HEIGHT}
                  stroke="#ccc" />
            )
          }
        </g>
      </svg>
    )
  }
});

module.exports = Sorted(GeneTable);
