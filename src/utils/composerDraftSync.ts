type SenderTextEditor = {
  getText(): string
  reset(options?: { clearHistory?: boolean }): Promise<void>
  setText(text: string): Promise<void>
}

type SenderWrapper = {
  getSender(): SenderTextEditor | null
} | null | undefined

/** Serialize reactive draft writes through XSender's asynchronous editor API. */
export class ComposerDraftSynchronizer {
  private revision = 0
  private queue: Promise<void> = Promise.resolve()
  private targetText: string | null = null
  private clearing = false

  schedule(
    resolveSender: () => SenderWrapper,
    desiredText: string,
    isCurrent: (text: string) => boolean,
  ): Promise<void> {
    const revision = ++this.revision
    this.queue = this.queue.catch(() => undefined).then(async () => {
      if (revision !== this.revision || !isCurrent(desiredText)) return
      const editor = resolveSender()?.getSender()
      if (!editor || editor.getText() === desiredText) return

      this.targetText = desiredText
      this.clearing = true
      try {
        await editor.reset({ clearHistory: true })
        this.clearing = false
        if (revision !== this.revision || !isCurrent(desiredText)) return
        if (desiredText) await editor.setText(desiredText)
      } finally {
        if (revision === this.revision) {
          this.targetText = null
          this.clearing = false
        }
      }
    })
    return this.queue
  }

  flush(): Promise<void> {
    return this.queue
  }

  shouldIgnoreChange(actualText: string): boolean {
    return this.targetText !== null && (
      actualText === this.targetText || (this.clearing && actualText === '')
    )
  }
}
