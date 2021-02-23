"use strict";

import * as R from 'ramda'
import * as d3 from 'd3'
import { Action } from 'redux'
import { ThunkAction } from 'redux-thunk'

import {
  TreatmentName,
  PairwiseComparison,
  DifferentialExpression,
  SortPath,
  SortOrder,
  DredgeState,
  TranscriptName
} from './ts_types'


import { projectForView } from './utils'

export type AppThunk<ReturnType = void> = ThunkAction<
  Promise<ReturnType>,
  DredgeState,
  unknown,
  Action<string>
>

function delay(time: number): Promise<void> {
  if (time === 0 && window.setTimeout) {
    return new Promise(resolve => setImmediate(resolve))
  } else {
    return new Promise(resolve => setTimeout(resolve, time))
  }
}


interface SetPairwiseComparisonResponse {
  pairwiseData: PairwiseComparison;
  resort: boolean;
}

// Load the table produced by the edgeR function `exactTest`:
// <https://rdrr.io/bioc/edgeR/man/exactTest.html>
function setPairwiseComparison(
  treatmentAKey: TreatmentName,
  treatmentBKey: TreatmentName
): AppThunk<SetPairwiseComparisonResponse> {
  return async (dispatch, getState) => {
    const project = projectForView(getState())

    const cacheKey = [treatmentAKey, treatmentBKey].toString()
        , cached = project.pairwiseComparisonCache[cacheKey]

    if (cached !== null) {
      await delay(0);

      return {
        pairwiseData: cached,
        resort: true,
      }
    }

    const treatmentA = project.treatments[treatmentAKey]
        , treatmentB = project.treatments[treatmentBKey]

    if (!treatmentA) {
      throw new Error(`No such treatment: ${treatmentAKey}`)
    }

    if (!treatmentB) {
      throw new Error(`No such treatment: ${treatmentBKey}`)
    }

    const urlTemplate = project.config.pairwiseName || './pairwise_tests/%A_%B.txt'

    const fileURLA = new URL(
      urlTemplate.replace('%A', treatmentAKey).replace('%B', treatmentBKey),
      window.location.toString()
    ).href

    const fileURLB = new URL(
      urlTemplate.replace('%A', treatmentBKey).replace('%B', treatmentAKey),
      window.location.toString()
    ).href

    let reverse = false
      , resp

    const [ respA, respB ] = await Promise.all([
      fetch(fileURLA),
      fetch(fileURLB),
    ])

    if (respA.ok) {
      resp = respA
      reverse = true
    } else if (respB.ok) {
      resp = respB
    } else {
      throw new Error(`Could not download pairwise test from ${fileURLA} or ${fileURLB}`)
    }

    const text = await resp.text()

    let minPValue = 1

    const pairwiseMap = new Map(text
      .trim()
      .split('\n')
      .slice(1) // Skip header
      .map(row => {
        const [ id, logFC, logATA, _pValue ] = row.split('\t')
            , pValue = parseFloat(_pValue)

        if (pValue !== 0 && !isNaN(pValue) && (pValue < minPValue)) {
          minPValue = pValue
        }

        const name = project.getCanonicalTranscriptLabel(id)

        const [
          treatmentA_AbundanceMean=null,
          treatmentA_AbundanceMedian=null,
          treatmentB_AbundanceMean=null,
          treatmentB_AbundanceMedian=null,
        ] = R.chain(
          abundances => abundances === null
            ? [null, null]
            : [d3.mean(abundances), d3.median(abundances)],
          [project.abundancesForTreatmentTranscript(treatmentAKey, name), project.abundancesForTreatmentTranscript(treatmentBKey, name)]
        )

        return [name, {
          name,
          treatmentA_AbundanceMean,
          treatmentA_AbundanceMedian,
          treatmentB_AbundanceMean,
          treatmentB_AbundanceMedian,
          pValue,
          logFC: (reverse ? -1 : 1 ) * parseFloat(logFC),
          logATA: parseFloat(logATA),
        }]
      }))

    const pairwiseData: PairwiseComparison = Object.assign(pairwiseMap, {
      minPValue,
      fcSorted: R.sortBy(R.prop('logFC'), Array.from(pairwiseMap.values())),
      ataSorted: R.sortBy(R.prop('logATA'), Array.from(pairwiseMap.values())),
    })

    return {
      pairwiseData,
      resort: true,
    }
  }
}

interface GetDefaultPairwiseComparisonResponse {
  treatmentA: TreatmentName;
  treatmentB: TreatmentName;
}


function getDefaultPairwiseComparison(
): AppThunk<GetDefaultPairwiseComparisonResponse>{
  return async (dispatch, getState) => {
    const project = projectForView(getState())
        , { treatments } = project
        , [ treatmentA, treatmentB ] = Object.keys(treatments)

    return {
      treatmentA,
      treatmentB,
    }
  }
}

interface UpdateSortForTreatmentsResponse {
  sortedTranscripts: Array<DifferentialExpression>;
  resort: boolean;
}

function updateSortForTreatments(
  sortPath: SortPath | void,
  order: SortOrder | void
): AppThunk<UpdateSortForTreatmentsResponse> {
  return async (dispatch, getState) => {
    const { view } = getState()

    if (view === null) {
      throw new Error('Can\'t update sort for null view')
    }

    const { pairwiseData } = view
        , resolvedSortPath = sortPath || view.sortPath
        , resolvedOrder = order || view.order

    const getter =
      resolvedSortPath === 'name'
        ? (d: DifferentialExpression) => d.name.toLowerCase()
        : (d: DifferentialExpression) => d[resolvedSortPath]

    const comparator = (resolvedOrder === 'asc' ? R.ascend : R.descend)(R.identity)

    const sortedTranscripts = R.sort(
      (a, b) => {
        const aVal = getter(a)
            , bVal = getter(b)

        if (aVal === undefined) return 1
        if (bVal === undefined) return -1

        return comparator(aVal, bVal)
      },
      pairwiseData === null
        ? []
        : Array.from(pairwiseData.values())
    )

    return {
      sortedTranscripts,
      resort: true,
    }
  }
}

interface UpdateDisplayedTranscriptsResponse {
  displayedTranscripts: Array<DifferentialExpression>;
}

function withinBounds(min: number, max: number, value: number) {
  return value >= min && value <= max
}


function updateDisplayedTranscripts(
): AppThunk<UpdateDisplayedTranscriptsResponse> {
  return async (dispatch, getState) => {
    const { view } = getState()
        , project = projectForView(getState())

    if (view === null) {
      throw new Error('Can\'t run on null view')
    }

    const {
      sortedTranscripts,
      savedTranscripts,
      pairwiseData,
      pValueThreshold,
      brushedArea,
      hoveredBinTranscripts,
      selectedBinTranscripts,
      sortPath,
      order,
    } = view

    let listedTranscripts: Set<TranscriptName> = new Set()

    if (pairwiseData && brushedArea) {
      const [ minLogATA, maxLogFC, maxLogATA, minLogFC ] = brushedArea

      const ok = (de: DifferentialExpression) => {
        const { logFC, logATA, pValue } = de

        return (
          withinBounds(0, pValueThreshold, pValue) &&
          withinBounds(minLogATA, maxLogATA, logATA) &&
          withinBounds(minLogFC, maxLogFC, logFC)
        )
      }

      pairwiseData.forEach(transcript => {
        if (ok(transcript)) {
          listedTranscripts.add(transcript.name)
        }
      })
    } else if (selectedBinTranscripts) {
      listedTranscripts = selectedBinTranscripts
    } else if (hoveredBinTranscripts) {
      listedTranscripts = hoveredBinTranscripts
    } else {
      listedTranscripts = savedTranscripts
    }

    const displayedTranscripts = sortedTranscripts
      .filter(({ name }) => listedTranscripts.has(name))

    const comparator = (order === 'asc' ? R.ascend : R.descend)(R.identity)

    const alphaSort = R.sort((a: DifferentialExpression, b: DifferentialExpression) =>
      comparator(a.name.toLowerCase(), b.name.toLowerCase()))

    let extraTranscripts = Array.from(listedTranscripts)
      .filter(name => !pairwiseData.has(name))
      .map(name => ({
        name: project.getCanonicalTranscriptLabel(name),
      }))

    extraTranscripts = R.sort(alphaSort, extraTranscripts)

    // Must add to list
    extraTranscripts.forEach(notPresentTranscript => {
      if (sortPath !== 'name') {
        // If anything but the name is being sorted on (i.e. any of the fields
        // which would have a numerical value), then just add all of these extra
        // transcripts to the bottom of the list
        displayedTranscripts.push(notPresentTranscript)
      } else {
        // Otherwise, interleave them in the alphabetically sorted list
        let i = 0

        for (const transcript of displayedTranscripts) {
          if (comparator(notPresentTranscript.name.toLowerCase(), transcript.name.toLowerCase()) === 1) {
            i++
          } else {
            break;
          }
        }

        displayedTranscripts.splice(i, 0, notPresentTranscript)
      }
    })

    return { displayedTranscripts }
  }
}
