import { Link } from "react-router-dom";


export function NotFoundPage() {
  return (
    <section className="panel">
      <p className="panel__eyebrow">404</p>
      <h2>页面不存在</h2>
      <p>当前路由不在前端骨架配置中。</p>
      <Link className="text-link" to="/">
        返回大厅
      </Link>
    </section>
  );
}
