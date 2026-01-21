import styles from "./input.module.css"

type InputProps = {
    type?: "text" | "email" | "tel" | "password" | "date",
    placeholder: string,
    isLoading?: boolean,
    size?: "sm" | "md" | "lg",
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void,
    label: string,
    name: string,
    value: string
}

const Input = ({type = "text", placeholder, value ,isLoading = false, size = "md", onChange, label, name}: InputProps) => {
  return (
    <label htmlFor={name}>
        {label}
        <input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          disabled={isLoading}
          onChange={onChange}
          className={`${styles.input} ${styles[size]}`}
        />
    </label>
  )
}

export default Input
