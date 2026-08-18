import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownMessageProps {
  text: string
}

export function MarkdownMessage({ text }: MarkdownMessageProps) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          input: props => <input {...props} disabled />
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
