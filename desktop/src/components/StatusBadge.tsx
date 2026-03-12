interface StatusBadgeProps {
	status: string
	tone?: 'neutral' | 'success' | 'warning'
}

export function StatusBadge({ status, tone = 'neutral' }: StatusBadgeProps) {
	return <span className={`status-badge ${tone}`}>{status}</span>
}
