"use strict";

const h = require('react-hyperscript')
    , { Box, Heading } = require('rebass')

function Para(props) {
  return h(Box, Object.assign({
    as: 'p',
    mb: 3,
    mt: 2,
  }, props))
}

module.exports = function Help() {
  return (
    h(Box, {
      style: {
        width: '6in',
        margin: 'auto',
        lineHeight: '20px',
      },
    }, [
      h(Heading, { as: 'h2', mt: 2 }, 'About'),

      h(Para, `
        This is an interactive tool for comparing transcript abundance between different treatments in genomic datasets.
      `),

      h(Para, `
        At the center of the tool is an MA plot, which plots genes by their average expression level (x-axis), and by the extent to which transcripts are enriched in one of two treatments being compared (y-axis). The user can select which two treatments t hey wish to compare by clicking on cells or whole embryos above and below the plot.
      `),

      h(Para, `
        Once the MA plot shows a comparison of interest, the user can filter results by significance of differential expression (via the P-value slider to the right). The user can select specific genes by clicking on pixels within the MA plot. When each pixel is clicked, the gene(s) represented by that pixel will show up in the table on the right. The user can add any of these genes to a "watched gene list", which will keep those g enes highlighted in subsequent MA plots. The user can also select large swaths of genes by dragging the mouse over a section of the MA plot.
      `),

      h(Para, `
        The watched gene list can be sorted by a number of features (enrichment in on treatment or the other, average abundance, and others), and can also be exported. To view a summary of gene expression in all treatments through all time points, the user can click on any gene name in the table, and retrieve a pictogram of all stages, with cells colored by quantitative expression data.
      `),

      h(Heading, { as: 'h2', mt: 4 }, 'Attribution'),

      h(Para, 'Designed by Sophia Tintori and Patrick Golden'),

      h(Para, [
        'Coded by Patrick Golden',
        h('br'),
        h('a', {
          href: 'https://github.com/ptgolden/dredge',
        }, 'Source'),
      ]),

      h(Para, [
        'Please cite as:',

        h('br'),

          `
Tintori, SC, Osborne Nishimura, E, Golden, PT, Lieb, JD, Goldstein, B. 2016. A Transcriptional Lineage of Early C. Elegans Development. (In Preparation).`
      ]),
    ])
  )
}