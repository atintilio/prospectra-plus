// A Next.js template remounts on navigation without moving the persistent sidebar.
export default function AppTemplate({children}:{children:React.ReactNode}){
 return <div className="prospectra-page-enter">{children}</div>;
}
