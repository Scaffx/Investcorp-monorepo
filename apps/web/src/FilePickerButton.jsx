import { useRef } from "react";

export default function FilePickerButton({
  label = "Selecionar arquivos",
  accept = "*/*",
  multiple = true,
  onFiles,
  className = "",
  buttonClassName = "menu-item",
}) {
  const inputRef = useRef(null);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleChange(e) {
    const files = Array.from(e.target.files || []);
    onFiles?.(files);
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="input-visually-hidden"
        onChange={handleChange}
        // se quiser limpar depois, pode manipular inputRef.current.value = ""
      />
      <button type="button" className={buttonClassName} onClick={openPicker}>
        {label}
      </button>
    </div>
  );
}
