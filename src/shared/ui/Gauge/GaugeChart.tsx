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
    const safeTotal = Number.isFinite(totalValue) && totalValue > 0 ? totalValue : 0
    const rawValue = Number.isFinite(value) ? Math.max(0, value) : 0
    const safeValue = safeTotal > 0 ? Math.min(rawValue, safeTotal) : 0
    const gaugeMax = safeTotal > 0 ? safeTotal : 1

    return (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 3 }}>
            <div className={styles.gauge_content}>
                <Gauge
                    width={width}
                    height={heigth}
                    value={safeValue}
                    valueMin={0}
                    valueMax={gaugeMax}
                    startAngle={-90}
                    endAngle={90}
                />
                <p>{safeValue}/{safeTotal} Videos Concluidos</p>
            </div>
        </Stack>
    )
}
