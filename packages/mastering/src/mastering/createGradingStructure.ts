import { Element } from 'libxmljs2'
import _ from 'lodash'
import { Exam } from './schema'
import { getAttribute, getNumericAttribute, isElement } from './utils'

export interface GradingStructure {
  questions: GradingStructureQuestion[]
}

type GradingStructureQuestion = TextQuestion | ChoiceGroupQuestion

interface TextQuestion {
  type: 'text'
  id: number
  displayNumber: string
  maxScore: number
}

interface ChoiceGroupQuestion {
  type: 'choicegroup'
  id: number
  displayNumber: string
  choices: ChoiceGroupChoice[]
}

interface ChoiceGroupChoice {
  id: number
  displayNumber: string
  type: 'choice'
  options: ChoiceGroupOption[]
}

interface ChoiceGroupOption {
  id: number
  correct: boolean
  score: number
}

export function createGradingStructure(exam: Exam): GradingStructure {
  const questions = _.flatMap(exam.answers, ({ element }) => {
    switch (element.name()) {
      case 'text-answer':
      case 'scored-text-answer':
        return mkTextQuestion(element)
      case 'choice-answer':
      case 'dropdown-answer':
        return mkChoiceGroupQuestion(element)
      default:
        return []
    }
  })

  return { questions }
}

function mkTextQuestion(answer: Element): TextQuestion {
  const id = getNumericAttribute('question-id', answer)
  const displayNumber = getAttribute('display-number', answer)
  const maxScore = getNumericAttribute('max-score', answer)

  return {
    id,
    displayNumber,
    maxScore,
    type: 'text' as const
  }
}

function mkChoiceGroupQuestion(answer: Element): ChoiceGroupQuestion {
  const questionId = getNumericAttribute('question-id', answer)
  const displayNumber = getAttribute('display-number', answer)
  const maxScore = getNumericAttribute('max-score', answer)

  const options: ChoiceGroupOption[] = answer
    .childNodes()
    .filter(isElement)
    .map(option => {
      const id = getNumericAttribute('option-id', option)
      const score = getNumericAttribute('score', option, 0)
      const correct = score > 0 && score === maxScore
      return { id, score, correct }
    })

  const choices: ChoiceGroupChoice[] = [
    {
      id: questionId,
      displayNumber,
      type: 'choice',
      options
    }
  ]

  return { id: questionId, displayNumber, type: 'choicegroup', choices }
}
