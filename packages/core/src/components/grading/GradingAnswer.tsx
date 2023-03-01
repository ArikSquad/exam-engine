import React, { FormEvent, useEffect, useLayoutEffect, useRef } from 'react'
import { Annotation } from '../..'
import {
  annotationFromMousePosition,
  getOverlappingMessages,
  hasTextSelectedInAnswerText,
  imageAnnotationMouseDownInfo,
  mergeAnnotation,
  NewImageAnnotation,
  selectionHasNothingToUnderline,
  showAndPositionElement,
  textAnnotationFromRange,
} from './editAnnotations'
import {
  renderAnnotations,
  renderImageAnnotationByImage,
  updateImageAnnotationMarkSize,
  wrapAllImages,
} from '../../renderAnnotations'
import GradingAnswerAnnotationList from './GradingAnswerAnnotationList'
import { changeLanguage, initI18n } from '../../i18n'
import { updateLargeImageWarnings } from './largeImageDetector'
import { I18nextProvider } from 'react-i18next'
import { useCached } from '../../useCached'
import { AnswerCharacterCounter } from './AnswerCharacterCounter'

type Annotations = { pregrading: Annotation[]; censoring: Annotation[] }

type GradingRole = 'pregrading' | 'censoring'
export function GradingAnswer({
  answer: { type, characterCount, value },
  language,
  isReadOnly,
  gradingRole,
  annotations,
  saveAnnotations,
  maxLength,
}: {
  answer: { type: 'richText' | 'text'; characterCount: number; value: string }
  language: string
  isReadOnly: boolean
  gradingRole: GradingRole
  maxLength?: number
  annotations: Annotations
  saveAnnotations: (annotations: Annotations) => void
}) {
  const answerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLFormElement>(null)
  const messageRef = useRef<HTMLInputElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  let newAnnotationObject: Annotation | undefined
  let savedAnnotations: Annotations
  const imgAnnotationState: {
    start: NewImageAnnotation | undefined
    element: HTMLElement | undefined
    img: HTMLImageElement | undefined
  } = { start: undefined, element: undefined, img: undefined }
  let isEditAnnotationPopupVisible = false
  let annotationDataForTooltip: { index: number; role: GradingRole; message: string } | undefined
  let annotationPositionForPopup: DOMRect
  let hideTooltipTimeout: ReturnType<typeof setTimeout>
  let windowResizeTimeout: ReturnType<typeof setTimeout>

  function onAnnotationOrListClick(e: React.MouseEvent<HTMLDivElement>) {
    const element = e.target
    if (element instanceof HTMLElement) {
      if (element.tagName === 'MARK') {
        showTooltip(element)
      } else if (element.tagName === 'LI') {
        const index = element.dataset.listNumber?.replace(')', '')!
        const mark = document.querySelector<HTMLElement>(`.e-annotation[data-index="${index}"]`)!
        showTooltip(mark)
        mark.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } else if (annotationDataForTooltip) {
        hideTooltip()
      }
    }
  }

  function editExistingAnnotation(e: React.MouseEvent<HTMLSpanElement>) {
    if ((e.target as HTMLElement).closest('.editable')) {
      toggle(tooltipRef.current, false)
      showExistingAnnotationPopup(annotationPositionForPopup)
    }
  }

  useLayoutEffect(() => {
    if (answerRef.current) {
      savedAnnotations = annotations
      toggle(tooltipRef.current, false)
      toggle(popupRef.current, false)
      renderAnswerWithAnnotations(savedAnnotations)
      answerRef.current.setAttribute('lang', language)
    }

    window.onresize = () => {
      clearTimeout(windowResizeTimeout)
      windowResizeTimeout = setTimeout(() => updateLargeImageWarnings(answerRef.current!), 1000)
    }
  })

  const i18n = useCached(() => initI18n(language))
  useEffect(changeLanguage(i18n, language))

  return (
    <I18nextProvider i18n={i18n}>
      <div onClick={(e) => onAnnotationOrListClick(e)} className="e-grading-answer-wrapper">
        <div
          className="e-grading-answer e-line-height-l e-mrg-b-1"
          ref={answerRef}
          onMouseDown={(e) => onAnswerMouseDown(e)}
          onMouseOver={(e) => onMouseOverAnnotation(e.target as HTMLElement)}
        />
        <AnswerCharacterCounter characterCount={characterCount} maxLength={maxLength} />
        <GradingAnswerAnnotationList
          censoring={annotations.censoring}
          pregrading={annotations.pregrading}
          singleGrading={false}
        />
        <form
          style={{ display: 'none' }}
          ref={popupRef}
          className="e-grading-answer-popup e-grading-answer-add-annotation"
          onSubmit={(e) => onSubmitAnnotation(e)}
        >
          <input name="message" className="e-grading-answer-add-annotation-text" type="text" ref={messageRef} />
          <button className="e-grading-answer-add-annotation-button" type="submit" data-i18n="arpa.annotate">
            Merkitse
          </button>
          <button
            className="e-grading-answer-close-popup"
            onClick={(e) => {
              e.preventDefault()
              hideAnnotationPopupAndRefresh()
            }}
          >
            ×
          </button>
        </form>
        <div
          style={{ display: 'none' }}
          ref={tooltipRef}
          className="e-grading-answer-tooltip e-grading-answer-popup"
          onMouseOver={onMouseOverTooltip}
          onMouseOut={hideTooltip}
        >
          <span onClick={(e) => editExistingAnnotation(e)} className="e-grading-answer-tooltip-label">
            tooltip text
          </span>
          <button onClick={(e) => removeAnnotation(e)} className="e-grading-answer-tooltip-remove">
            ×
          </button>
        </div>
      </div>
    </I18nextProvider>
  )

  function removeAnnotation(e: React.MouseEvent<HTMLButtonElement, MouseEvent>): void {
    e.preventDefault()
    hideTooltip()
    savedAnnotations[annotationDataForTooltip!.role].splice(annotationDataForTooltip!.index, 1)
    annotationDataForTooltip = undefined
    saveAnnotations(savedAnnotations)
  }
  function hideTooltip() {
    hideTooltipTimeout = setTimeout(() => {
      toggle(tooltipRef.current, false)
    }, 400)
  }

  function onMouseOverTooltip() {
    clearTimeout(hideTooltipTimeout)
  }
  function onMouseOutFromTooltip(e: MouseEvent) {
    const target = e.target as Element
    if (target.tagName === 'MARK') {
      clearTimeout(hideTooltipTimeout)
      hideTooltip()
    }
    answerRef.current!.removeEventListener('mouseout', onMouseOutFromTooltip)
  }

  function showTooltip(target: HTMLElement) {
    clearTimeout(hideTooltipTimeout)
    const tooltip = tooltipRef.current!
    const { type, listIndex, message } = target.dataset
    tooltip.classList.toggle('editable', !isReadOnly && type === gradingRole)
    annotationPositionForPopup = target.getBoundingClientRect()
    showAndPositionElement(annotationPositionForPopup, answerRef.current!, tooltip)
    tooltip.querySelector('.e-grading-answer-tooltip-label')!.textContent = message || '–'
    annotationDataForTooltip = { index: Number(listIndex), role: type as GradingRole, message: message || '' }
    answerRef.current!.addEventListener('mouseout', onMouseOutFromTooltip)
  }

  function onMouseOverAnnotation(target: HTMLElement) {
    if (
      target.tagName === 'MARK' &&
      !isEditAnnotationPopupVisible &&
      (!hasTextSelectedInAnswerText() || isReadOnly) &&
      !imgAnnotationState.element
    ) {
      showTooltip(target)
    }
  }
  function showAnnotationPopup(rect: DOMRect, message: string) {
    annotationDataForTooltip = undefined
    setupAnnotationPopup(rect, message)
  }
  function showExistingAnnotationPopup(rect: DOMRect) {
    setupAnnotationPopup(rect, annotationDataForTooltip!.message)
  }
  function setupAnnotationPopup(rect: DOMRect, message: string) {
    // Could be active from previous popup
    window.removeEventListener('keydown', onKeyUpInAnnotationPopup)
    showAndPositionElement(rect, answerRef.current!, popupRef.current!)
    const inputElement = messageRef.current!
    inputElement.value = message
    inputElement.focus()
    isEditAnnotationPopupVisible = true
    window.addEventListener('keydown', onKeyUpInAnnotationPopup)
  }

  function hideAnnotationPopupAndRefresh() {
    newAnnotationObject = undefined
    imgAnnotationState.element = undefined
    imgAnnotationState.img = undefined
    isEditAnnotationPopupVisible = false
    window.removeEventListener('keydown', onKeyUpInAnnotationPopup)
    toggle(popupRef.current, false)
    renderAnswerWithAnnotations(savedAnnotations)
  }
  function onAnswerMouseDown(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (isReadOnly) {
      return
    }
    window.addEventListener('mouseup', onWindowMouseUpAfterAnswerMouseDown)

    // Do annotations only with left mouse buttons
    if (e.button !== 0) {
      return
    }
    const target = e.target as Element
    const img = target.closest('.e-annotation-wrapper')?.querySelector<HTMLImageElement>('img') || undefined
    if (!img) {
      return
    }
    img.addEventListener('dragstart', preventDefaults) // Prevent dragging images when marking image annotations
    imgAnnotationState.start = imageAnnotationMouseDownInfo(e, img)
    imgAnnotationState.img = img
    window.addEventListener('mousemove', onMouseMoveForImageAnnotation)
  }

  function onWindowMouseUpAfterAnswerMouseDown() {
    imgAnnotationState.img?.removeEventListener('dragstart', preventDefaults)
    window.removeEventListener('mousemove', onMouseMoveForImageAnnotation)
    window.removeEventListener('mouseup', onWindowMouseUpAfterAnswerMouseDown)

    // Image annotation is being created since shape exists
    if (imgAnnotationState.element) {
      showAnnotationPopup(imgAnnotationState.element?.getBoundingClientRect()!, '')
      return
    }

    // Text annotation
    const selection = window.getSelection()
    if (selection && answerRef.current !== null && hasTextSelectedInAnswerText()) {
      const range = selection.getRangeAt(0)
      if (selectionHasNothingToUnderline(range)) {
        return
      }
      const position = textAnnotationFromRange(answerRef.current, range)
      const message = getOverlappingMessages(savedAnnotations[gradingRole], position.startIndex, position.length)
      newAnnotationObject = { ...position, type: 'text', message }
      showAnnotationPopup(range.getBoundingClientRect(), message)
      const newAnnotations = { ...savedAnnotations }
      newAnnotations[gradingRole] = mergeAnnotation(
        answerRef.current,
        newAnnotationObject,
        savedAnnotations[gradingRole]
      )
      renderAnswerWithAnnotations(newAnnotations)
    }
  }

  function onMouseMoveForImageAnnotation(e: MouseEvent) {
    preventDefaults(e)
    newAnnotationObject = annotationFromMousePosition(e, imgAnnotationState.start!)
    // Create shape on first mouse move and resize after that
    if (imgAnnotationState.element) {
      updateImageAnnotationMarkSize(imgAnnotationState.element, newAnnotationObject)
    } else {
      imgAnnotationState.element = renderImageAnnotationByImage(
        imgAnnotationState.img!,
        '',
        newAnnotationObject,
        gradingRole,
        999
      )
    }
  }

  function renderAnswerWithAnnotations(annotations: Annotations) {
    const container = answerRef.current!
    if (type === 'richText') {
      container.innerHTML = value
      wrapAllImages(container)
      updateLargeImageWarnings(container)
    } else {
      container.textContent = value
    }
    renderAnnotations(container, annotations.pregrading, annotations.censoring, false)
  }

  function onSubmitAnnotation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const message = messageRef.current!.value
    if (annotationDataForTooltip) {
      // Editing existing annotation message by clicking tooltip
      savedAnnotations[annotationDataForTooltip.role][annotationDataForTooltip.index].message = message
    } else {
      // Saving new annotation
      savedAnnotations[gradingRole] = mergeAnnotation(
        answerRef.current!,
        { ...newAnnotationObject!, message },
        savedAnnotations[gradingRole] || []
      )
    }
    toggle(popupRef.current, false)
    saveAnnotations(savedAnnotations)
  }

  function onKeyUpInAnnotationPopup(e: KeyboardEvent) {
    if (e.key === 'Escape' && isEditAnnotationPopupVisible) {
      hideAnnotationPopupAndRefresh()
    }
  }
}

function preventDefaults(e: Event) {
  e.preventDefault()
  e.stopPropagation()
}

function toggle(element: HTMLElement | null, isVisible: boolean): void {
  if (element instanceof HTMLElement) {
    element.style.display = isVisible ? 'initial' : 'none'
  }
}