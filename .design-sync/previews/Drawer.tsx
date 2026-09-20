import {
  Button, Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@saturday-slate/design-system";

// The sheet is fixed to the viewport, so the card runs single-cell (see config overrides).
export function LockOfTheWeek() {
  return (
    <Drawer open modal={false} dismissible={false}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Lock of the Week</DrawerTitle>
          <DrawerDescription>Pick one game to double. You can change it until Sat 12:00 PM.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button variant="secondary">Lock Georgia</Button>
          <Button variant="outline">Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
