export function BusinessSetup({open}:{businessId:string;stock:boolean;food:boolean;restaurant:boolean;payments:boolean;open:(screen:string)=>void}) {
  return <section className="panel"><h2>Workspace setup</h2><button type="button" className="primary-button" onClick={()=>open('WorkspaceSetup')}>Set up my workspace</button></section>
}
