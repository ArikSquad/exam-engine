import React, { createRef, useContext, useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Provider } from 'react-redux'
import { ExamAnswer, ExamServerAPI, InitialCasStatus, RestrictedAudioPlaybackStats } from '../../index'
import { createRenderChildNodes } from '../../createRenderChildNodes'
import { findChildElement } from '../../dom-utils'
import { changeLanguage, initI18n } from '../../i18n'
import { examTitleId } from '../../ids'
import { parseExamStructure } from '../../parser/parseExamStructure'
import { scrollToHash } from '../../scrollToHash'
import { initializeExamStore } from '../../store'
import { useCached } from '../../useCached'
import mkAttachmentLink from '../shared/AttachmentLink'
import mkAttachmentLinks from '../shared/AttachmentLinks'
import Audio from '../shared/Audio'
import AudioGroup from '../shared/AudioGroup'
import AudioTest from '../shared/AudioTest'
import ChoiceAnswer from './ChoiceAnswer'
import { CommonExamContext, withCommonExamContext } from '../context/CommonExamContext'
import DocumentTitle from '../DocumentTitle'
import DropdownAnswer from './DropdownAnswer'
import ErrorIndicator from './internal/ErrorIndicator'
import ExamAttachment from './Attachment'
import { withExamContext } from '../context/ExamContext'
import ExamFooter from './ExamFooter'
import ExamInstruction from './ExamInstruction'
import Question from './Question'
import QuestionInstruction from './QuestionInstruction'
import QuestionTitle from './QuestionTitle'
import Section from './Section'
import SectionTitle from './SectionTitle'
import ExternalMaterial from './ExternalMaterial'
import File from '../shared/File'
import Formula from '../shared/Formula'
import Hints from './Hints'
import Image from '../shared/Image'
import ImageOverlay from '../shared/ImageOverlay'
import References from '../shared/References'
import SaveIndicator from './internal/SaveIndicator'
import SectionElement from '../SectionElement'
import SectionInstruction from './SectionInstruction'
import { mkTableOfContents } from '../shared/TableOfContents'
import TextAnswer from './TextAnswer'
import Video from '../shared/Video'
import RenderChildNodes from '../RenderChildNodes'
import { QuestionNumber } from '../shared/QuestionNumber'
import ExamTranslation from '../shared/ExamTranslation'
import * as _ from 'lodash-es'

/** Props common to taking the exams and viewing results */
export interface CommonExamProps {
  /** Initial answers */
  answers: ExamAnswer[]
  /** The URL for the attachments page */
  attachmentsURL: string
  /** A function that maps an attachment filename to a full URI. */
  resolveAttachment: (filename: string) => string
  /** The exam XML */
  doc: XMLDocument
  /** @deprecated Not used anymore */
  language?: string
}

/** Props related to taking the exam, 'executing' it */
export interface ExamProps extends CommonExamProps {
  /** The status of CAS software on the OS */
  casStatus: InitialCasStatus
  /** The CAS countdown duration in seconds. 60 seconds by default. */
  casCountdownDuration?: number
  /**
   * Playback statistics about restricted audio files. Used for calculating
   * whether the user can listen to them any more.
   */
  restrictedAudioPlaybackStats: RestrictedAudioPlaybackStats[]
  /** Exam Server API implementation */
  examServerApi: ExamServerAPI
}

const renderChildNodes = createRenderChildNodes({
  attachment: ExamAttachment,
  'attachment-link': mkAttachmentLink('link'),
  'attachment-links': mkAttachmentLinks('link'),
  audio: Audio,
  'audio-title': RenderChildNodes,
  'audio-group': AudioGroup,
  'audio-test': AudioTest,
  'choice-answer': ChoiceAnswer,
  'dropdown-answer': DropdownAnswer,
  'exam-footer': ExamFooter,
  'external-material': ExternalMaterial,
  file: File,
  formula: Formula,
  image: Image,
  question: Question,
  'question-number': QuestionNumber,
  translation: ExamTranslation,
  'question-instruction': QuestionInstruction,
  'question-title': QuestionTitle,
  hints: Hints,
  references: References,
  'scored-text-answer': TextAnswer,
  'scored-text-answers': Hints,
  'section-instruction': SectionInstruction,
  section: Section,
  'section-title': SectionTitle,
  'text-answer': TextAnswer,
  video: Video,
  'image-overlay': ImageOverlay
})

const Exam: React.FunctionComponent<ExamProps> = ({
  doc,
  casStatus,
  answers,
  restrictedAudioPlaybackStats,
  examServerApi
}) => {
  const { date, dateTimeFormatter, dayCode, examCode, language, resolveAttachment, root, subjectLanguage } =
    useContext(CommonExamContext)

  const examTitle = findChildElement(root, 'exam-title')
  const examInstruction = findChildElement(root, 'exam-instruction')
  const tableOfContents = findChildElement(root, 'table-of-contents')
  const externalMaterial = findChildElement(root, 'external-material')
  const examStylesheet = root.getAttribute('exam-stylesheet')

  const examRef = createRef<HTMLDivElement>()

  const store = useCached(() =>
    initializeExamStore(parseExamStructure(doc), casStatus, answers, restrictedAudioPlaybackStats, examServerApi)
  )

  const TableOfContentsSidebar = useCached(() =>
    mkTableOfContents({
      showAttachmentLinks: true,
      showAnsweringInstructions: true,
      isInSidebar: true
    })
  )

  const TableOfContents = useCached(() =>
    mkTableOfContents({
      showAttachmentLinks: true,
      showAnsweringInstructions: true,
      isInSidebar: false
    })
  )

  const i18n = useCached(() => initI18n(language, examCode, dayCode))
  useEffect(changeLanguage(i18n, language))

  useEffect(scrollToHash, [])

  const isInViewport = (element: Element) => {
    const rect = element.getBoundingClientRect()
    return rect.top >= 100 && rect.bottom <= window.innerHeight - 100
  }

  const handleExamScroll = () => {
    const scrollY = window.scrollY
    const sections = document.querySelectorAll('.e-exam-question.e-level-0')
    const sideNavigation = document.querySelector(`.sidebar-toc-container .table-of-contents`)

    const lis = document.querySelectorAll(`.sidebar-toc-container li[data-list-number]`)
    lis.forEach(i => i.classList.remove('current'))

    // Find the section currently in view
    sections.forEach(section => {
      const sectionTop = section.getBoundingClientRect().top + scrollY
      const sectionBottom = section.getBoundingClientRect().bottom + scrollY

      const sectionBeginsInView = sectionTop < scrollY + window.innerHeight && sectionTop > scrollY
      const sectionEndsInView = sectionBottom < scrollY + window.innerHeight && sectionBottom > scrollY
      const sectionFillsView = sectionTop < scrollY && sectionBottom > scrollY + window.innerHeight

      const sectionId = section.querySelector('.anchor')?.id || ''
      const sectionNumber = sectionId.replace('question-nr-', '')

      if (sectionBeginsInView || sectionEndsInView || sectionFillsView) {
        const currentNavTitle = document.querySelector(`.table-of-contents li[data-list-number="${sectionNumber}."]`)

        if (currentNavTitle) {
          currentNavTitle.classList.add('current')
          const isVisible = isInViewport(currentNavTitle)

          if (!isVisible && !!sideNavigation) {
            const navHeight = sideNavigation.getBoundingClientRect().height
            const scrollToPos = (currentNavTitle as HTMLElement).offsetTop - navHeight / 2
            sideNavigation.scrollTo({ behavior: 'smooth', top: scrollToPos })
          }
        }
      }
    })
  }

  window.addEventListener('scroll', _.throttle(handleExamScroll, 100, { trailing: false }))

  const handleTOCScroll = (e: Event) => {
    const toc = e.currentTarget as Element

    if (toc.scrollHeight <= toc.clientHeight) {
      return
    }
    const deltaY = (e as WheelEvent).deltaY
    const hitsTop = deltaY < 0 && toc.scrollTop === 0
    const hitsBottom = deltaY > 0 && toc.scrollTop >= toc.scrollHeight - toc.clientHeight
    if (hitsTop || hitsBottom) {
      e.preventDefault()
    }
  }

  useEffect(() => {
    const toc = document.querySelector('.sidebar-toc-container .table-of-contents')
    toc?.addEventListener('wheel', handleTOCScroll, { passive: false })
    return () => toc?.addEventListener('wheel', handleTOCScroll, { passive: false })
  }, [])

  return (
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <main className="e-exam" lang={subjectLanguage} aria-labelledby={examTitleId} ref={examRef}>
          <React.StrictMode />
          {examStylesheet && <link rel="stylesheet" href={resolveAttachment(examStylesheet)} />}

          <div className="e-toc-and-exam">
            {tableOfContents && (
              <div className="sidebar-toc-container" aria-hidden="true">
                <TableOfContentsSidebar {...{ element: tableOfContents, renderChildNodes }} />
              </div>
            )}

            <div className="main-exam-container">
              <div className="main-exam">
                <SectionElement aria-labelledby={examTitleId}>
                  {examTitle && <DocumentTitle id={examTitleId}>{renderChildNodes(examTitle)}</DocumentTitle>}
                  {date && (
                    <p>
                      <strong>{dateTimeFormatter.format(date)}</strong>
                    </p>
                  )}
                  {examInstruction && <ExamInstruction {...{ element: examInstruction, renderChildNodes }} />}

                  {tableOfContents && (
                    <div className="main-toc-container">
                      <TableOfContents
                        {...{
                          element: tableOfContents,
                          renderChildNodes
                        }}
                      />
                    </div>
                  )}
                  {externalMaterial && (
                    <ExternalMaterial {...{ element: externalMaterial, renderChildNodes, forceRender: true }} />
                  )}
                </SectionElement>
                {renderChildNodes(root)}
              </div>
            </div>
          </div>
          <div className="e-footer">
            <ErrorIndicator />
            <SaveIndicator />
          </div>
        </main>
      </I18nextProvider>
    </Provider>
  )
}

export default React.memo(withExamContext(withCommonExamContext(Exam)))
