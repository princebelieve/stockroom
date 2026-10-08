export type ListOrder='az'|'za'|'newest'|'oldest'
export function ListSort({value,change,dates=true}:{value:ListOrder;change:(value:ListOrder)=>void;dates?:boolean}){
 return <label className="list-sort">Sort by<select value={value} onChange={event=>change(event.target.value as ListOrder)}><option value="az">Name: A–Z</option><option value="za">Name: Z–A</option>{dates&&<><option value="newest">Recently updated first</option><option value="oldest">Oldest update first</option></>}</select></label>
}
