import { useTranslation } from "react-i18next";
import type { FlowTaskItem, FlowTaskStatus } from "../../features/flow/types";


type FlowTaskListProps = {
  items: FlowTaskItem[];
  label?: string;
};

function getStatusLabel(status: FlowTaskStatus): string {
  switch (status) {
    case "completed": return "completed";
    case "current": return "current";
    case "upcoming": return "upcoming";
  }
}

export function FlowTaskList({ items, label }: FlowTaskListProps) {
  const { t } = useTranslation();
  return (
    <ol aria-label={label ?? t("common:pageFlow")} className="flow-task-list">
      {items.map((item) => (
        <li
          key={item.id}
          aria-current={item.status === "current" ? "step" : undefined}
          className={`flow-task-list__item flow-task-list__item--${item.status}`}
        >
          <div className="flow-task-list__marker" aria-hidden="true" />
          <div className="flow-task-list__body">
            <p className="flow-task-list__status">{t(`common:statusLabels.${getStatusLabel(item.status)}`)}</p>
            <p className="flow-task-list__title">{item.title}</p>
            <p className="flow-task-list__description">{item.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
