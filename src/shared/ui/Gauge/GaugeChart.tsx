import styles from "./gauge.module.css"
import Stack from "@mui/material/Stack"
import { Gauge } from "@mui/x-charts"

type GaugeProps = {
    width: number,
    heigth: number,
    value: number,
    totalValue: number
}

export default function GaugeChart({width, heigth, value, totalValue}: GaugeProps) {
    return (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 3 }}>
            <div className={styles.gauge_content}>
                <Gauge width={width} height={heigth} value={value} startAngle={-90} endAngle={90} />
                <p>{value}/{totalValue} Cursos Realizados</p>
            </div>
        </Stack>
    )
}
