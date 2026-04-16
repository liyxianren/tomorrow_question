import type { FlowTaskItem, FlowTaskStatus } from "../../features/flow/types";


type FlowTaskListProps = {
  items: FlowTaskItem[];
  label?: string;
};

const STATUS_LABELS: Record<FlowTaskStatus, string> = {
  completed: "已完成",
  current: "当前",
  upcoming: "待开始",
};

export function FlowTaskList({ items, label = "页面流程" }: FlowTaskListProps) {
  return (
    <ol aria-label={label} className="flow-task-list">
      {items.map((item) => (
        <li
          key={item.id}
          aria-current={item.status === "current" ? "step" : undefined}
          className={`flow-task-list__item flow-task-list__item--${item.status}`}
        >
          <div className="flow-task-list__marker" aria-hidden="true" />
          <div className="flow-task-list__body">
            <p className="flow-task-list__status">{STATUS_LABELS[item.status]}</p>
            <p className="flow-task-list__title">{item.title}</p>
            <p className="flow-task-list__description">{item.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
