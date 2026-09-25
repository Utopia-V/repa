import { useId, useRef, useState } from "react";
import { BookOpen, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./learning-upload.css";

// SCRUM-70：材料仅暂存于当前页面；学习流程未接入，开始学习入口暂时禁用。
export function LearningUpload() {
  const inputId = useId();
  // SCRUM-70：记录嵌套拖拽层数，避免经过书本和文字时错误清除拖入状态。
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  // SCRUM-70：选择和拖拽共用去重入口，以名称、大小和修改时间识别重复材料。
  function addFiles(incoming: File[]) {
    setFiles((current) => {
      const next = [...current];
      for (const file of incoming) {
        if (!next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file);
      }
      return next;
    });
  }

  return <section className="learning-upload" aria-label="上传学习材料">
    <label
      className="learning-upload-dropzone"
      data-dragging={dragging}
      htmlFor={inputId}
      onDragEnter={(event) => { event.preventDefault(); dragDepth.current++; setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(event) => { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <BookOpen className="learning-upload-book" aria-hidden="true" strokeWidth={1.25} />
      <span className="learning-upload-title">{dragging ? "松开以添加材料" : "把学习材料拖到这里"}</span>
      <span className="learning-upload-hint">或点击选择文件，支持一次添加多份材料</span>
      <input id={inputId} type="file" multiple className="learning-upload-input"
        onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    </label>
    {files.length > 0 && <ul className="learning-upload-files" aria-label="已选择的材料">
      {files.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`}>
        <span>{file.name}</span>
        <Button variant="ghost" size="icon" aria-label={`移除 ${file.name}`} onClick={() => { setFiles((current) => current.filter((_, position) => position !== index)); }}><X aria-hidden="true" /></Button>
      </li>)}
    </ul>}
    <Button className="w-full" disabled title="学习页面尚未开放">开始学习<ArrowRight aria-hidden="true" /></Button>
    <p className="learning-upload-hint" role="status">{files.length ? `已选择 ${files.length} 份材料` : "从一份材料开始你的学习"}</p>
  </section>;
}
